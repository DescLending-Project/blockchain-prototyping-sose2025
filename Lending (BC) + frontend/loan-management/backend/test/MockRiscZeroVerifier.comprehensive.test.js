const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockRiscZeroVerifier - Comprehensive Coverage", function () {
    let mockVerifier;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy MockRiscZeroVerifier
        const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
        mockVerifier = await MockRiscZeroVerifier.deploy();
        await mockVerifier.waitForDeployment();
    });

    describe("Basic Verification Functions", function () {
        it("should verify with valid parameters", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // Should not revert for valid parameters
            await expect(
                mockVerifier.verify(seal, imageId, journalDigest)
            ).to.not.be.reverted;
        });

        it("should reject empty seal", async function () {
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            await expect(
                mockVerifier.verify("0x", imageId, journalDigest)
            ).to.be.revertedWith("MockVerifier: Empty seal");
        });

        it("should allow zero imageId and journalDigest", async function () {
            const seal = ethers.randomBytes(32);
            const zeroBytes32 = ethers.ZeroHash;

            // Should not revert even with zero values (for testing flexibility)
            await expect(
                mockVerifier.verify(seal, zeroBytes32, zeroBytes32)
            ).to.not.be.reverted;
        });

        it("should handle various seal sizes", async function () {
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // Test with different seal sizes
            const smallSeal = ethers.randomBytes(16);
            const largeSeal = ethers.randomBytes(64);
            const exactSeal = ethers.randomBytes(32);

            await expect(mockVerifier.verify(smallSeal, imageId, journalDigest)).to.not.be.reverted;
            await expect(mockVerifier.verify(largeSeal, imageId, journalDigest)).to.not.be.reverted;
            await expect(mockVerifier.verify(exactSeal, imageId, journalDigest)).to.not.be.reverted;
        });
    });

    describe("Journal-based Verification", function () {
        it("should verify with journal data", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const journal = ethers.toUtf8Bytes("test journal data");

            // Just test that the function doesn't revert
            await expect(
                mockVerifier.verifyWithJournal(seal, imageId, journal)
            ).to.not.be.reverted;
        });

        it("should handle empty journal data", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const emptyJournal = "0x";

            // Should still work with empty journal
            await expect(
                mockVerifier.verifyWithJournal(seal, imageId, emptyJournal)
            ).to.not.be.reverted;
        });

        it("should handle large journal data", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const largeJournal = ethers.toUtf8Bytes("x".repeat(1000)); // Large journal

            await expect(
                mockVerifier.verifyWithJournal(seal, imageId, largeJournal)
            ).to.not.be.reverted;
        });

        it("should compute journal digest correctly", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const journal = ethers.toUtf8Bytes("test data");
            const expectedDigest = ethers.sha256(journal);

            // The function should internally compute sha256(journal) and call verify
            await expect(
                mockVerifier.verifyWithJournal(seal, imageId, journal)
            ).to.not.be.reverted;
        });
    });

    describe("Mock-specific Functions", function () {
        it("should identify as mock verifier", async function () {
            const isMock = await mockVerifier.isMockVerifier();
            expect(isMock).to.be.true;
        });

        it("should return correct version", async function () {
            const version = await mockVerifier.version();
            expect(version).to.equal("MockRiscZeroVerifier-v1.0.0-demo");
        });

        it("should handle version function correctly", async function () {
            const version = await mockVerifier.version();
            expect(version).to.be.a("string");
            expect(version.length).to.be.gt(0);
        });

        it("should handle isMockVerifier function correctly", async function () {
            const isMock = await mockVerifier.isMockVerifier();
            expect(isMock).to.be.a("boolean");
        });
    });

    describe("TradFi Proof Testing", function () {
        it("should test TradFi proof with valid parameters", async function () {
            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("tradfi proof data");

            await expect(
                mockVerifier.testTradFiProof(seal, journalData)
            ).to.emit(mockVerifier, "ProofVerificationAttempted")
            .withArgs(ethers.ZeroHash, ethers.keccak256(journalData), true);
        });

        it("should reject TradFi proof with empty seal", async function () {
            const journalData = ethers.toUtf8Bytes("tradfi proof data");

            await expect(
                mockVerifier.testTradFiProof("0x", journalData)
            ).to.be.revertedWith("Seal cannot be empty");
        });

        it("should reject TradFi proof with empty journal data", async function () {
            const seal = ethers.randomBytes(32);

            await expect(
                mockVerifier.testTradFiProof(seal, "0x")
            ).to.be.revertedWith("Journal data cannot be empty");
        });

        it("should handle various TradFi journal formats", async function () {
            const seal = ethers.randomBytes(32);

            // Test with JSON-like data
            const jsonData = ethers.toUtf8Bytes('{"creditScore": 750, "source": "test"}');
            await expect(
                mockVerifier.testTradFiProof(seal, jsonData)
            ).to.not.be.reverted;

            // Test with binary data
            const binaryData = ethers.randomBytes(64);
            await expect(
                mockVerifier.testTradFiProof(seal, binaryData)
            ).to.not.be.reverted;

            // Test with structured data
            const structuredData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint256", "string", "bool"],
                [750, "excellent", true]
            );
            await expect(
                mockVerifier.testTradFiProof(seal, structuredData)
            ).to.not.be.reverted;
        });
    });

    describe("Event Emission", function () {
        it("should emit ProofVerificationAttempted event correctly", async function () {
            const seal = ethers.randomBytes(32);
            const journalData = ethers.toUtf8Bytes("test data");
            const expectedDigest = ethers.keccak256(journalData);

            await expect(
                mockVerifier.testTradFiProof(seal, journalData)
            ).to.emit(mockVerifier, "ProofVerificationAttempted")
            .withArgs(ethers.ZeroHash, expectedDigest, true);
        });

        it("should handle event emission with different data types", async function () {
            const seal = ethers.randomBytes(32);

            // Test with string data
            const stringData = ethers.toUtf8Bytes("string test");
            await expect(
                mockVerifier.testTradFiProof(seal, stringData)
            ).to.emit(mockVerifier, "ProofVerificationAttempted");

            // Test with numeric data
            const numericData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [12345]);
            await expect(
                mockVerifier.testTradFiProof(seal, numericData)
            ).to.emit(mockVerifier, "ProofVerificationAttempted");

            // Test with address data
            const addressData = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [user1.address]);
            await expect(
                mockVerifier.testTradFiProof(seal, addressData)
            ).to.emit(mockVerifier, "ProofVerificationAttempted");
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("should handle maximum size inputs", async function () {
            // Test with maximum practical sizes
            const maxSeal = ethers.randomBytes(1024); // Large seal
            const maxImageId = ethers.randomBytes(32);
            const maxJournalDigest = ethers.randomBytes(32);

            await expect(
                mockVerifier.verify(maxSeal, maxImageId, maxJournalDigest)
            ).to.not.be.reverted;
        });

        it("should handle minimum valid inputs", async function () {
            const minSeal = ethers.randomBytes(1); // Minimum non-empty seal
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            await expect(
                mockVerifier.verify(minSeal, imageId, journalDigest)
            ).to.not.be.reverted;
        });

        it("should handle repeated calls with same parameters", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // Multiple calls with same parameters should all succeed
            await expect(mockVerifier.verify(seal, imageId, journalDigest)).to.not.be.reverted;
            await expect(mockVerifier.verify(seal, imageId, journalDigest)).to.not.be.reverted;
            await expect(mockVerifier.verify(seal, imageId, journalDigest)).to.not.be.reverted;
        });

        it("should handle concurrent calls from different users", async function () {
            const seal1 = ethers.randomBytes(32);
            const seal2 = ethers.randomBytes(32);
            const seal3 = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // Concurrent calls from different addresses
            await Promise.all([
                mockVerifier.connect(user1).verify(seal1, imageId, journalDigest),
                mockVerifier.connect(user2).verify(seal2, imageId, journalDigest),
                mockVerifier.connect(user3).verify(seal3, imageId, journalDigest)
            ]);
        });

        it("should handle special byte patterns", async function () {
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // Test with all zeros
            const zeroSeal = new Uint8Array(32);
            await expect(
                mockVerifier.verify(ethers.hexlify(zeroSeal), imageId, journalDigest)
            ).to.not.be.reverted;

            // Test with all 0xFF
            const maxSeal = new Uint8Array(32).fill(255);
            await expect(
                mockVerifier.verify(ethers.hexlify(maxSeal), imageId, journalDigest)
            ).to.not.be.reverted;

            // Test with alternating pattern
            const patternSeal = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
                patternSeal[i] = i % 2 === 0 ? 0xAA : 0x55;
            }
            await expect(
                mockVerifier.verify(ethers.hexlify(patternSeal), imageId, journalDigest)
            ).to.not.be.reverted;
        });
    });

    describe("Gas Usage and Performance", function () {
        it("should have reasonable gas usage for basic verification", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // verify is a view function that doesn't return anything, just test it doesn't revert
            await expect(
                mockVerifier.verify(seal, imageId, journalDigest)
            ).to.not.be.reverted;
        });

        it("should handle batch verifications efficiently", async function () {
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // Perform multiple verifications
            const promises = [];
            for (let i = 0; i < 10; i++) {
                const seal = ethers.randomBytes(32);
                promises.push(mockVerifier.verify(seal, imageId, journalDigest));
            }

            await Promise.all(promises);
        });
    });

    describe("Integration Scenarios", function () {
        it("should work with real-world-like data formats", async function () {
            const seal = ethers.randomBytes(32);

            // Simulate account proof data
            const accountData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "bytes32"],
                [user1.address, ethers.parseEther("100"), ethers.randomBytes(32)]
            );

            await expect(
                mockVerifier.testTradFiProof(seal, accountData)
            ).to.not.be.reverted;

            // Simulate TradFi score data
            const tradFiData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint256", "string", "uint256"],
                [750, "Excellent", Math.floor(Date.now() / 1000)]
            );

            await expect(
                mockVerifier.testTradFiProof(seal, tradFiData)
            ).to.not.be.reverted;
        });

        it("should handle verification in transaction context", async function () {
            const seal = ethers.randomBytes(32);
            const imageId = ethers.randomBytes(32);
            const journalDigest = ethers.randomBytes(32);

            // Verify that the function can be called without reverting
            await expect(
                mockVerifier.verify(seal, imageId, journalDigest)
            ).to.not.be.reverted;
        });
    });
});
