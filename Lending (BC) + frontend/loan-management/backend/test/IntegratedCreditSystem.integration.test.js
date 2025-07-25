const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IntegratedCreditSystem - Integration Tests", function () {
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

    describe("Complete Integration Test", function () {
        it("should handle full verification workflow", async function () {
            // Submit TradFi proof
            const tradFiSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_" + Date.now());
            const tradFiJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["750", "experian", "2024-01-15", "5 years", "excellent"]]
            );
            await creditSystem.connect(user1).submitTradFiProof(tradFiSeal, tradFiJournal);

            // Submit Account proof
            const accountSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_" + Date.now());
            const accountJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 100, ethers.utils.parseEther("10"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    12345, mockAccountProofData.stateRoot]]
            );
            await creditSystem.connect(user1).submitAccountProof(accountSeal, accountJournal);

            // Submit Nesting proof
            const nestingSeal = ethers.utils.toUtf8Bytes("MOCK_NESTING_SEAL_" + Date.now());
            const nestingJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,uint256,uint256)"],
                [[user1.address, 85, 75, 80, Math.floor(Date.now() / 1000)]]
            );
            await creditSystem.connect(user1).submitNestingProof(nestingSeal, nestingJournal);

            // Check final profile
            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasTradFiVerification).to.be.true;
            expect(profile.hasAccountVerification).to.be.true;
            expect(profile.hasNestingVerification).to.be.true;
            expect(profile.finalCreditScore.toNumber()).to.be.greaterThan(0);
            expect(profile.isEligibleForBorrowing).to.be.true;
        });

        it("should handle mixed verification types", async function () {
            // Submit only TradFi and Account proofs
            const tradFiSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_MIXED_" + Date.now());
            const tradFiJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["800", "experian", "2024-01-15", "5 years", "excellent"]]
            );
            await creditSystem.connect(user1).submitTradFiProof(tradFiSeal, tradFiJournal);

            const accountSeal = ethers.utils.toUtf8Bytes("MOCK_ACCOUNT_SEAL_MIXED_" + Date.now());
            const accountJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(address,uint256,uint256,bytes32,bytes32,uint256,bytes32)"],
                [[user1.address, 100, ethers.utils.parseEther("10"),
                mockAccountProofData.storageRoot, mockAccountProofData.codeHash,
                    12345, mockAccountProofData.stateRoot]]
            );
            await creditSystem.connect(user1).submitAccountProof(accountSeal, accountJournal);

            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasTradFiVerification).to.be.true;
            expect(profile.hasAccountVerification).to.be.true;
            expect(profile.hasNestingVerification).to.be.false;
            expect(profile.finalCreditScore.toNumber()).to.be.greaterThan(0);
        });

        it("should handle single verification type", async function () {
            const tradFiSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_SINGLE_" + Date.now());
            const tradFiJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["800", "experian", "2024-01-15", "5 years", "excellent"]]
            );

            await creditSystem.connect(user1).submitTradFiProof(tradFiSeal, tradFiJournal);

            const profile = await creditSystem.creditProfiles(user1.address);
            expect(profile.hasTradFiVerification).to.be.true;
            expect(profile.hasAccountVerification).to.be.false;
            expect(profile.hasNestingVerification).to.be.false;
            expect(profile.finalCreditScore.toNumber()).to.be.greaterThan(0);
        });
    });

    describe("Borrowing Eligibility", function () {
        it("should determine eligibility based on credit score", async function () {
            // Test with high score
            const highScoreSeal = ethers.utils.toUtf8Bytes("MOCK_HIGH_SCORE_" + Date.now());
            const highScoreJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["800", "experian", "2024-01-15", "5 years", "excellent"]]
            );

            await creditSystem.connect(user1).submitTradFiProof(highScoreSeal, highScoreJournal);

            let isEligible = await creditSystem.isEligibleToBorrow(user1.address);
            expect(isEligible).to.be.true;

            // Test with low score
            const lowScoreSeal = ethers.utils.toUtf8Bytes("MOCK_LOW_SCORE_" + Date.now());
            const lowScoreJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["300", "experian", "2024-01-15", "1 year", "poor"]]
            );

            await creditSystem.connect(user2).submitTradFiProof(lowScoreSeal, lowScoreJournal);

            isEligible = await creditSystem.isEligibleToBorrow(user2.address);
            expect(isEligible).to.be.false;
        });
    });

    describe("Verification Validity and Expiration", function () {
        it("should handle expired verifications", async function () {
            const tradFiSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_750_" + Date.now());
            const tradFiJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["750", "experian", "2024-01-15", "5 years", "excellent"]]
            );

            await creditSystem.connect(user1).submitTradFiProof(tradFiSeal, tradFiJournal);

            const initialProfile = await creditSystem.creditProfiles(user1.address);
            const initialScore = initialProfile.finalCreditScore;

            // Fast forward time beyond validity period
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]); // 31 days
            await ethers.provider.send("evm_mine");

            // Submit new proof to trigger recalculation
            const newSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_750_" + (Date.now() + 1000));
            await creditSystem.connect(user1).submitTradFiProof(newSeal, tradFiJournal);

            const finalProfile = await creditSystem.creditProfiles(user1.address);
            // Score should be recalculated based on current valid verifications
            expect(finalProfile.finalCreditScore.toNumber()).to.be.greaterThan(0);
        });
    });
});