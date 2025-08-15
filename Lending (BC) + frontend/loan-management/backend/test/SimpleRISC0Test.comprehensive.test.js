const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleRISC0Test - Comprehensive Coverage", function () {
    let simpleRISC0Test, mockVerifier;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy MockRiscZeroVerifier
        const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
        mockVerifier = await MockRiscZeroVerifier.deploy();
        await mockVerifier.waitForDeployment();

        // Deploy SimpleRISC0Test
        const SimpleRISC0Test = await ethers.getContractFactory("SimpleRISC0Test");
        simpleRISC0Test = await SimpleRISC0Test.deploy(await mockVerifier.getAddress());
        await simpleRISC0Test.waitForDeployment();
    });

    describe("Initialization and Setup", function () {
        it("should initialize with correct verifier", async function () {
            expect(await simpleRISC0Test.verifier()).to.equal(await mockVerifier.getAddress());
        });

        it("should have correct image IDs", async function () {
            expect(await simpleRISC0Test.ACCOUNT_MERKLE_IMAGE_ID()).to.equal(
                "0xb083f461f1de589187ceac04a9eb2c0fd7c99b8c80f4ed3f3d45963c8b9606bf"
            );
            expect(await simpleRISC0Test.TRADFI_SCORE_IMAGE_ID()).to.equal(
                "0x81c6f5d0702b3a373ce771febb63581ed62fbd6ff427e4182bb827144e4a4c4c"
            );
            expect(await simpleRISC0Test.NESTING_PROOF_IMAGE_ID()).to.equal(
                "0x6da21d5bc6a7534bc686b9294717f12994b13c67183c86668c62d01fcc453151"
            );
        });

        it("should initialize with demo mode disabled", async function () {
            expect(await simpleRISC0Test.demoMode()).to.be.false;
        });

        it("should initialize with no verifications", async function () {
            expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.false;
            expect(await simpleRISC0Test.hasVerifiedAccount(user1.address)).to.be.false;
            expect(await simpleRISC0Test.hasVerifiedNesting(user1.address)).to.be.false;
        });
    });

    describe("Demo Mode Management", function () {
        it("should allow setting demo mode", async function () {
            await expect(simpleRISC0Test.setDemoMode(true)).to.not.be.reverted;
            expect(await simpleRISC0Test.demoMode()).to.be.true;

            await expect(simpleRISC0Test.setDemoMode(false)).to.not.be.reverted;
            expect(await simpleRISC0Test.demoMode()).to.be.false;
        });

        it("should allow anyone to toggle demo mode", async function () {
            await expect(simpleRISC0Test.connect(user1).setDemoMode(true)).to.not.be.reverted;
            expect(await simpleRISC0Test.demoMode()).to.be.true;

            await expect(simpleRISC0Test.connect(user2).setDemoMode(false)).to.not.be.reverted;
            expect(await simpleRISC0Test.demoMode()).to.be.false;
        });
    });

    describe("TradFi Proof Verification", function () {
        describe("Demo Mode", function () {
            beforeEach(async function () {
                await simpleRISC0Test.setDemoMode(true);
            });

            it("should verify TradFi proof in demo mode", async function () {
                const seal = ethers.randomBytes(32);
                const journalData = ethers.toUtf8Bytes("tradfi proof data");

                await expect(
                    simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData)
                ).to.emit(simpleRISC0Test, "TradFiProofVerified")
                .withArgs(user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

                expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.true;
            });

            it("should reject empty seal in demo mode", async function () {
                const journalData = ethers.toUtf8Bytes("tradfi proof data");

                await expect(
                    simpleRISC0Test.connect(user1).testTradFiProof("0x", journalData)
                ).to.be.revertedWith("Seal cannot be empty");
            });

            it("should reject empty journal data in demo mode", async function () {
                const seal = ethers.randomBytes(32);

                await expect(
                    simpleRISC0Test.connect(user1).testTradFiProof(seal, "0x")
                ).to.be.revertedWith("Journal data cannot be empty");
            });

            it("should handle various journal data formats in demo mode", async function () {
                const seal = ethers.randomBytes(32);

                // JSON-like data
                const jsonData = ethers.toUtf8Bytes('{"creditScore": 750, "source": "test"}');
                await expect(
                    simpleRISC0Test.connect(user1).testTradFiProof(seal, jsonData)
                ).to.emit(simpleRISC0Test, "TradFiProofVerified");

                // Binary data
                const binaryData = ethers.randomBytes(64);
                await expect(
                    simpleRISC0Test.connect(user2).testTradFiProof(seal, binaryData)
                ).to.emit(simpleRISC0Test, "TradFiProofVerified");

                // Structured data
                const structuredData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["uint256", "string", "bool"],
                    [750, "excellent", true]
                );
                await expect(
                    simpleRISC0Test.connect(user3).testTradFiProof(seal, structuredData)
                ).to.emit(simpleRISC0Test, "TradFiProofVerified");
            });
        });

        describe("Production Mode", function () {
            beforeEach(async function () {
                await simpleRISC0Test.setDemoMode(false);
            });

            it("should verify TradFi proof in production mode", async function () {
                const seal = ethers.randomBytes(32);
                const journalData = ethers.toUtf8Bytes("tradfi proof data");

                await expect(
                    simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData)
                ).to.emit(simpleRISC0Test, "TradFiProofVerified")
                .withArgs(user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

                expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.true;
            });

            it("should handle verification failure gracefully", async function () {
                // Create a failing verifier for testing error handling
                const FailingVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
                const failingVerifier = await FailingVerifier.deploy();
                await failingVerifier.waitForDeployment();

                const SimpleRISC0TestWithFailingVerifier = await ethers.getContractFactory("SimpleRISC0Test");
                const testWithFailingVerifier = await SimpleRISC0TestWithFailingVerifier.deploy(
                    await failingVerifier.getAddress()
                );
                await testWithFailingVerifier.waitForDeployment();

                const seal = "0x"; // This will cause the mock verifier to fail
                const journalData = ethers.toUtf8Bytes("test data");

                await expect(
                    testWithFailingVerifier.connect(user1).testTradFiProof(seal, journalData)
                ).to.be.revertedWith("TradFi verification failed: MockVerifier: Empty seal");
            });
        });
    });

    describe("Account Proof Verification", function () {
        describe("Demo Mode", function () {
            beforeEach(async function () {
                await simpleRISC0Test.setDemoMode(true);
            });

            it("should verify account proof in demo mode", async function () {
                const seal = ethers.randomBytes(32);
                const journalData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "bytes32"],
                    [user1.address, ethers.parseEther("100"), ethers.randomBytes(32)]
                );

                await expect(
                    simpleRISC0Test.connect(user1).testAccountProof(seal, journalData)
                ).to.emit(simpleRISC0Test, "AccountProofVerified")
                .withArgs(user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

                expect(await simpleRISC0Test.hasVerifiedAccount(user1.address)).to.be.true;
            });

            it("should reject empty seal in demo mode", async function () {
                const journalData = ethers.randomBytes(64);

                await expect(
                    simpleRISC0Test.connect(user1).testAccountProof("0x", journalData)
                ).to.be.revertedWith("Seal cannot be empty");
            });

            it("should reject empty journal data in demo mode", async function () {
                const seal = ethers.randomBytes(32);

                await expect(
                    simpleRISC0Test.connect(user1).testAccountProof(seal, "0x")
                ).to.be.revertedWith("Journal data cannot be empty");
            });
        });

        describe("Production Mode", function () {
            beforeEach(async function () {
                await simpleRISC0Test.setDemoMode(false);
            });

            it("should verify account proof in production mode", async function () {
                const seal = ethers.randomBytes(32);
                const journalData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "bytes32"],
                    [user1.address, ethers.parseEther("100"), ethers.randomBytes(32)]
                );

                await expect(
                    simpleRISC0Test.connect(user1).testAccountProof(seal, journalData)
                ).to.emit(simpleRISC0Test, "AccountProofVerified")
                .withArgs(user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

                expect(await simpleRISC0Test.hasVerifiedAccount(user1.address)).to.be.true;
            });

            it("should handle account verification failure", async function () {
                const seal = "0x"; // This will cause failure
                const journalData = ethers.randomBytes(64);

                await expect(
                    simpleRISC0Test.connect(user1).testAccountProof(seal, journalData)
                ).to.be.revertedWith("Account verification failed: MockVerifier: Empty seal");
            });
        });
    });

    describe("Nesting Proof Verification", function () {
        describe("Demo Mode", function () {
            beforeEach(async function () {
                await simpleRISC0Test.setDemoMode(true);
            });

            it("should verify nesting proof in demo mode", async function () {
                const seal = ethers.randomBytes(32);
                const journalData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256", "uint256"],
                    [user1.address, 85, 75, 80, Math.floor(Date.now() / 1000)]
                );

                await expect(
                    simpleRISC0Test.connect(user1).testNestingProof(seal, journalData)
                ).to.emit(simpleRISC0Test, "NestingProofVerified")
                .withArgs(user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

                expect(await simpleRISC0Test.hasVerifiedNesting(user1.address)).to.be.true;
            });

            it("should reject empty seal in demo mode", async function () {
                const journalData = ethers.randomBytes(64);

                await expect(
                    simpleRISC0Test.connect(user1).testNestingProof("0x", journalData)
                ).to.be.revertedWith("Seal cannot be empty");
            });

            it("should reject empty journal data in demo mode", async function () {
                const seal = ethers.randomBytes(32);

                await expect(
                    simpleRISC0Test.connect(user1).testNestingProof(seal, "0x")
                ).to.be.revertedWith("Journal data cannot be empty");
            });
        });

        describe("Production Mode", function () {
            beforeEach(async function () {
                await simpleRISC0Test.setDemoMode(false);
            });

            it("should verify nesting proof in production mode", async function () {
                const seal = ethers.randomBytes(32);
                const journalData = ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256", "uint256"],
                    [user1.address, 85, 75, 80, Math.floor(Date.now() / 1000)]
                );

                await expect(
                    simpleRISC0Test.connect(user1).testNestingProof(seal, journalData)
                ).to.emit(simpleRISC0Test, "NestingProofVerified")
                .withArgs(user1.address, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

                expect(await simpleRISC0Test.hasVerifiedNesting(user1.address)).to.be.true;
            });

            it("should handle nesting verification failure", async function () {
                const seal = "0x"; // This will cause failure
                const journalData = ethers.randomBytes(64);

                await expect(
                    simpleRISC0Test.connect(user1).testNestingProof(seal, journalData)
                ).to.be.revertedWith("Nesting verification failed: MockVerifier: Empty seal");
            });
        });
    });

    describe("Verification Status Tracking", function () {
        it("should track verification status correctly", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("test data");

            // Initially no verifications
            const [tradFi1, account1, nesting1] = await simpleRISC0Test.getVerificationStatus(user1.address);
            expect(tradFi1).to.be.false;
            expect(account1).to.be.false;
            expect(nesting1).to.be.false;

            // Verify TradFi
            await simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData);
            const [tradFi2, account2, nesting2] = await simpleRISC0Test.getVerificationStatus(user1.address);
            expect(tradFi2).to.be.true;
            expect(account2).to.be.false;
            expect(nesting2).to.be.false;

            // Verify Account
            await simpleRISC0Test.connect(user1).testAccountProof(seal, journalData);
            const [tradFi3, account3, nesting3] = await simpleRISC0Test.getVerificationStatus(user1.address);
            expect(tradFi3).to.be.true;
            expect(account3).to.be.true;
            expect(nesting3).to.be.false;

            // Verify Nesting
            await simpleRISC0Test.connect(user1).testNestingProof(seal, journalData);
            const [tradFi4, account4, nesting4] = await simpleRISC0Test.getVerificationStatus(user1.address);
            expect(tradFi4).to.be.true;
            expect(account4).to.be.true;
            expect(nesting4).to.be.true;
        });

        it("should track verification status per user", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("test data");

            // User1 verifies TradFi
            await simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData);

            // User2 verifies Account
            await simpleRISC0Test.connect(user2).testAccountProof(seal, journalData);

            // Check individual statuses
            const [tradFi1, account1, nesting1] = await simpleRISC0Test.getVerificationStatus(user1.address);
            const [tradFi2, account2, nesting2] = await simpleRISC0Test.getVerificationStatus(user2.address);

            expect(tradFi1).to.be.true;
            expect(account1).to.be.false;
            expect(nesting1).to.be.false;

            expect(tradFi2).to.be.false;
            expect(account2).to.be.true;
            expect(nesting2).to.be.false;
        });
    });

    describe("Utility Functions", function () {
        it("should return current timestamp in ping", async function () {
            const timestamp = await simpleRISC0Test.ping();
            const currentBlock = await ethers.provider.getBlock("latest");
            expect(timestamp).to.be.closeTo(currentBlock.timestamp, 5); // Within 5 seconds
        });

        it("should return verifier address", async function () {
            const verifierAddress = await simpleRISC0Test.getVerifierAddress();
            expect(verifierAddress).to.equal(await mockVerifier.getAddress());
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("should handle maximum size inputs", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const maxSeal = ethers.randomBytes(1024); // Large seal
            const maxJournalData = ethers.randomBytes(2048); // Large journal

            await expect(
                simpleRISC0Test.connect(user1).testTradFiProof(maxSeal, maxJournalData)
            ).to.not.be.reverted;

            await expect(
                simpleRISC0Test.connect(user1).testAccountProof(maxSeal, maxJournalData)
            ).to.not.be.reverted;

            await expect(
                simpleRISC0Test.connect(user1).testNestingProof(maxSeal, maxJournalData)
            ).to.not.be.reverted;
        });

        it("should handle minimum valid inputs", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const minSeal = ethers.randomBytes(1); // Minimum non-empty seal
            const minJournalData = ethers.randomBytes(1); // Minimum non-empty journal

            await expect(
                simpleRISC0Test.connect(user1).testTradFiProof(minSeal, minJournalData)
            ).to.not.be.reverted;

            await expect(
                simpleRISC0Test.connect(user1).testAccountProof(minSeal, minJournalData)
            ).to.not.be.reverted;

            await expect(
                simpleRISC0Test.connect(user1).testNestingProof(minSeal, minJournalData)
            ).to.not.be.reverted;
        });

        it("should handle repeated verifications", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("test data");

            // Multiple verifications should all succeed
            await expect(
                simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData)
            ).to.not.be.reverted;

            await expect(
                simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData)
            ).to.not.be.reverted;

            // Status should remain true
            expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.true;
        });

        it("should handle concurrent verifications from different users", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal1 = ethers.randomBytes(32);
            const seal2 = ethers.randomBytes(32);
            const seal3 = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("concurrent test");

            // Concurrent verifications
            await Promise.all([
                simpleRISC0Test.connect(user1).testTradFiProof(seal1, journalData),
                simpleRISC0Test.connect(user2).testAccountProof(seal2, journalData),
                simpleRISC0Test.connect(user3).testNestingProof(seal3, journalData)
            ]);

            // All should be verified
            expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedAccount(user2.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedNesting(user3.address)).to.be.true;
        });

        it("should handle special byte patterns", async function () {
            await simpleRISC0Test.setDemoMode(true);

            // Test with all zeros
            const zeroSeal = new Uint8Array(32);
            const zeroJournal = new Uint8Array(32);
            await expect(
                simpleRISC0Test.connect(user1).testTradFiProof(
                    ethers.hexlify(zeroSeal),
                    ethers.hexlify(zeroJournal)
                )
            ).to.not.be.reverted;

            // Test with all 0xFF
            const maxSeal = new Uint8Array(32).fill(255);
            const maxJournal = new Uint8Array(32).fill(255);
            await expect(
                simpleRISC0Test.connect(user1).testAccountProof(
                    ethers.hexlify(maxSeal),
                    ethers.hexlify(maxJournal)
                )
            ).to.not.be.reverted;

            // Test with alternating pattern
            const patternSeal = new Uint8Array(32);
            const patternJournal = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
                patternSeal[i] = i % 2 === 0 ? 0xAA : 0x55;
                patternJournal[i] = i % 2 === 0 ? 0x33 : 0xCC;
            }
            await expect(
                simpleRISC0Test.connect(user1).testNestingProof(
                    ethers.hexlify(patternSeal),
                    ethers.hexlify(patternJournal)
                )
            ).to.not.be.reverted;
        });

        it("should handle mode switching during verification", async function () {
            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("mode switch test");

            // Start in production mode
            await simpleRISC0Test.setDemoMode(false);
            await expect(
                simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData)
            ).to.not.be.reverted;

            // Switch to demo mode
            await simpleRISC0Test.setDemoMode(true);
            await expect(
                simpleRISC0Test.connect(user1).testAccountProof(seal, journalData)
            ).to.not.be.reverted;

            // Switch back to production mode
            await simpleRISC0Test.setDemoMode(false);
            await expect(
                simpleRISC0Test.connect(user1).testNestingProof(seal, journalData)
            ).to.not.be.reverted;

            // All verifications should be successful
            expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedAccount(user1.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedNesting(user1.address)).to.be.true;
        });
    });

    describe("Gas Usage and Performance", function () {
        it("should have reasonable gas usage for demo mode verifications", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("gas test");

            const tx1 = await simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData);
            const receipt1 = await tx1.wait();
            expect(receipt1.gasUsed).to.be.lt(100000); // Less than 100k gas

            const tx2 = await simpleRISC0Test.connect(user1).testAccountProof(seal, journalData);
            const receipt2 = await tx2.wait();
            expect(receipt2.gasUsed).to.be.lt(100000);

            const tx3 = await simpleRISC0Test.connect(user1).testNestingProof(seal, journalData);
            const receipt3 = await tx3.wait();
            expect(receipt3.gasUsed).to.be.lt(100000);
        });

        it("should handle batch verifications efficiently", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("batch test");

            // Perform multiple verifications in parallel
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData));
                promises.push(simpleRISC0Test.connect(user1).testAccountProof(seal, journalData));
                promises.push(simpleRISC0Test.connect(user1).testNestingProof(seal, journalData));
            }

            await Promise.all(promises);
        });
    });

    describe("Integration Scenarios", function () {
        it("should work with real-world-like proof data", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);

            // Simulate TradFi proof data
            const tradFiData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint256", "string", "uint256", "string"],
                [750, "Excellent", Math.floor(Date.now() / 1000), "Experian"]
            );

            await expect(
                simpleRISC0Test.connect(user1).testTradFiProof(seal, tradFiData)
            ).to.emit(simpleRISC0Test, "TradFiProofVerified");

            // Simulate account proof data
            const accountData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "bytes32", "uint256"],
                [user1.address, ethers.parseEther("100"), ethers.randomBytes(32), 12345]
            );

            await expect(
                simpleRISC0Test.connect(user1).testAccountProof(seal, accountData)
            ).to.emit(simpleRISC0Test, "AccountProofVerified");

            // Simulate nesting proof data
            const nestingData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256", "uint256"],
                [user1.address, 85, 75, 80, Math.floor(Date.now() / 1000)]
            );

            await expect(
                simpleRISC0Test.connect(user1).testNestingProof(seal, nestingData)
            ).to.emit(simpleRISC0Test, "NestingProofVerified");
        });

        it("should handle complete verification workflow", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("complete workflow test");

            // Step 1: Verify TradFi proof
            await simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData);
            let [tradFi, account, nesting] = await simpleRISC0Test.getVerificationStatus(user1.address);
            expect(tradFi).to.be.true;
            expect(account).to.be.false;
            expect(nesting).to.be.false;

            // Step 2: Verify Account proof
            await simpleRISC0Test.connect(user1).testAccountProof(seal, journalData);
            [tradFi, account, nesting] = await simpleRISC0Test.getVerificationStatus(user1.address);
            expect(tradFi).to.be.true;
            expect(account).to.be.true;
            expect(nesting).to.be.false;

            // Step 3: Verify Nesting proof
            await simpleRISC0Test.connect(user1).testNestingProof(seal, journalData);
            [tradFi, account, nesting] = await simpleRISC0Test.getVerificationStatus(user1.address);
            expect(tradFi).to.be.true;
            expect(account).to.be.true;
            expect(nesting).to.be.true;

            // All proofs should be verified
            expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedAccount(user1.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedNesting(user1.address)).to.be.true;
        });

        it("should handle verification in transaction context", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("transaction context test");

            // Verify that functions can be called within transactions
            const tx = await simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData);
            expect(tx.hash).to.be.a("string");
            expect(tx.hash.length).to.equal(66); // 0x + 64 hex chars

            const receipt = await tx.wait();
            expect(receipt.status).to.equal(1); // Success
        });

        it("should maintain state consistency across multiple calls", async function () {
            await simpleRISC0Test.setDemoMode(true);

            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("state consistency test");

            // Multiple users verify different proofs
            await simpleRISC0Test.connect(user1).testTradFiProof(seal, journalData);
            await simpleRISC0Test.connect(user2).testAccountProof(seal, journalData);
            await simpleRISC0Test.connect(user3).testNestingProof(seal, journalData);

            // Each user should have only their specific verification
            expect(await simpleRISC0Test.hasVerifiedTradFi(user1.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedAccount(user1.address)).to.be.false;
            expect(await simpleRISC0Test.hasVerifiedNesting(user1.address)).to.be.false;

            expect(await simpleRISC0Test.hasVerifiedTradFi(user2.address)).to.be.false;
            expect(await simpleRISC0Test.hasVerifiedAccount(user2.address)).to.be.true;
            expect(await simpleRISC0Test.hasVerifiedNesting(user2.address)).to.be.false;

            expect(await simpleRISC0Test.hasVerifiedTradFi(user3.address)).to.be.false;
            expect(await simpleRISC0Test.hasVerifiedAccount(user3.address)).to.be.false;
            expect(await simpleRISC0Test.hasVerifiedNesting(user3.address)).to.be.true;
        });
    });
});
