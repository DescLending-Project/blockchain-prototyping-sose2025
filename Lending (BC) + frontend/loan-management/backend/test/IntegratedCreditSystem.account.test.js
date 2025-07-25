const { expect } = require("chai");
const { ethers } = require("hardhat");
require("chai").use(require("chai-as-promised"));

describe("IntegratedCreditSystem - Account Tests", function () {
    let creditSystem, mockRisc0Verifier, mockLiquidityPool;
    let owner, user1, user2, user3;

    // Mock data structures
    const mockAccountProofData = {
        storageRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
        codeHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        stateRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
    };

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy SimpleRISC0Test
        const SimpleRISC0Test = await ethers.getContractFactory("SimpleRISC0Test");
        mockRisc0Verifier = await SimpleRISC0Test.deploy(owner.address);
        await mockRisc0Verifier.deployed();
        await mockRisc0Verifier.setDemoMode(true);

        // Deploy mock liquidity pool
        const MockLiquidityPool = await ethers.getContractFactory("MockPool");
        mockLiquidityPool = await MockLiquidityPool.deploy();
        await mockLiquidityPool.deployed();

        // Deploy IntegratedCreditSystem
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        creditSystem = await IntegratedCreditSystem.deploy(
            mockRisc0Verifier.address,
            mockLiquidityPool.address
        );
        await creditSystem.deployed();
    });

    describe("Account Proof Submission", function () {
        it("should successfully submit account proof", async function () {
            const mockSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_" + Date.now());
            const mockJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 100, ethers.utils.parseEther("10"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    12345, mockAccountProofData.stateRoot]]
            );

            const tx = await creditSystem.connect(user1).submitAccountProof(mockSeal, mockJournal);
            const receipt = await tx.wait();

            // Check events
            const verificationEvent = receipt.events?.find(e => e.event === "CreditVerificationCompleted");
            expect(verificationEvent).to.exist;
            expect(verificationEvent.args.verificationType).to.equal("Account");

            // Check profile update
            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasAccountVerification).to.be.true;
        });

        it("should reject account proof with wrong account address", async function () {
            const wrongAccountSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_WRONG_" + Date.now());
            const wrongAccountJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user2.address, 100, ethers.utils.parseEther("10"), ethers.utils.keccak256("0x1234"), ethers.utils.keccak256("0x5678"), 12345, ethers.utils.keccak256("0x9abc")]]
            );

            await expect(
                creditSystem.connect(user1).submitAccountProof(wrongAccountSeal, wrongAccountJournal)
            ).to.be.revertedWith("Account mismatch");
        });

        it("should calculate scores based on balance and activity", async function () {
            const testCases = [
                { balance: ethers.utils.parseEther("100"), nonce: 1000, expectedMin: 70 },
                { balance: ethers.utils.parseEther("1"), nonce: 10, expectedMin: 40 },
                { balance: ethers.utils.parseEther("0.1"), nonce: 1, expectedMin: 30 }
            ];

            for (let i = 0; i < testCases.length; i++) {
                const testCase = testCases[i];
                const testUser = [user1, user2, user3][i];

                const mockSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_" + i + "_" + Date.now());
                const mockJournal = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                    [[testUser.address, testCase.nonce, testCase.balance,
                    mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                        12345, mockAccountProofData.stateRoot]]
                );

                await creditSystem.connect(testUser).submitAccountProof(mockSeal, mockJournal);

                const profile = await creditSystem.creditProfiles(testUser.address);
                expect(profile.finalCreditScore.toNumber()).to.be.at.least(testCase.expectedMin);
            }
        });

        it("should test _uint2str functionality through event emission", async function () {
            const accountSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_" + Date.now());
            const accountJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 12345, ethers.utils.parseEther("99.5"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    67890, mockAccountProofData.stateRoot]]
            );

            const tx = await creditSystem.connect(user1).submitAccountProof(accountSeal, accountJournal);
            const receipt = await tx.wait();

            const proofDataEvent = receipt.events?.find(e => e.event === "ProofDataParsed");
            expect(proofDataEvent).to.exist;
            expect(proofDataEvent.args.details).to.include("12345"); // Nonce converted to string
        });

        it("should handle extreme balance values", async function () {
            const extremeSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_EXTREME_" + Date.now());
            const extremeJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 1000000, ethers.utils.parseEther("1000000"), ethers.utils.keccak256("0x1234"), ethers.utils.keccak256("0x5678"), 12345, ethers.utils.keccak256("0x9abc")]]
            );

            const tx = await creditSystem.connect(user1).submitAccountProof(extremeSeal, extremeJournal);
            await tx.wait();

            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasAccountVerification).to.be.true;
            expect(profile.accountScore.toNumber()).to.be.greaterThan(0);
        });
    });
});
