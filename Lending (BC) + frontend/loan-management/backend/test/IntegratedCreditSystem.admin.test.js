const { expect } = require("chai");
const { ethers } = require("hardhat");
require("chai").use(require("chai-as-promised"));

describe("IntegratedCreditSystem - Admin Tests", function () {
    let creditSystem, mockRisc0Verifier, mockLiquidityPool;
    let owner, user1, user2, user3;

    // Increase timeout for coverage
    this.timeout(30000);

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

    afterEach(async function () {
        // Clean up between tests
        if (mockRisc0Verifier) {
            await mockRisc0Verifier.setDemoMode(true);
        }
    });

    describe("Admin Functions", function () {
        it("should update scoring weights (admin only)", async function () {
            const tx = await creditSystem.connect(owner).updateScoringWeights(40, 40, 20);
            await tx.wait();

            const [tradFi, account, nesting] = await Promise.all([
                creditSystem.tradFiWeight(),
                creditSystem.accountWeight(),
                creditSystem.nestingWeight()
            ]);

            expect(tradFi.toNumber()).to.equal(40);
            expect(account.toNumber()).to.equal(40);
            expect(nesting.toNumber()).to.equal(20);
        });

        it("should reject invalid weight updates", async function () {
            await expect(
                creditSystem.connect(owner).updateScoringWeights(40, 40, 30) // Sum = 110
            ).to.be.revertedWith("Weights must sum to 100");
        });

        it("should reject weight updates from non-timelock", async function () {
            await expect(
                creditSystem.connect(user1).updateScoringWeights(40, 40, 20)
            ).to.be.revertedWith("Only DAO/Timelock");
        });

        it("should handle various weight combinations", async function () {
            const weightCombinations = [
                [60, 30, 10],
                [33, 33, 34],
                [100, 0, 0],
                [0, 50, 50]
            ];

            for (const weights of weightCombinations) {
                const tx = await creditSystem.connect(owner).updateScoringWeights(weights[0], weights[1], weights[2]);
                await tx.wait();

                const [tradFi, account, nesting] = await Promise.all([
                    creditSystem.tradFiWeight(),
                    creditSystem.accountWeight(),
                    creditSystem.nestingWeight()
                ]);

                expect(tradFi.toNumber()).to.equal(weights[0]);
                expect(account.toNumber()).to.equal(weights[1]);
                expect(nesting.toNumber()).to.equal(weights[2]);
            }
        });

        it("should reject weights that don't sum to 100", async function () {
            const invalidCombinations = [
                [50, 50, 50], // Sum = 150
                [10, 10, 10], // Sum = 30
                [0, 0, 0],    // Sum = 0
                [101, 0, 0]   // Sum = 101
            ];

            for (const weights of invalidCombinations) {
                await expect(
                    creditSystem.connect(owner).updateScoringWeights(weights[0], weights[1], weights[2])
                ).to.be.revertedWith("Weights must sum to 100");
            }
        });
    });

    describe("Access Control", function () {
        it("should only allow timelock to update weights", async function () {
            const tx = await creditSystem.connect(owner).updateScoringWeights(40, 40, 20);
            await tx.wait();

            await expect(
                creditSystem.connect(user1).updateScoringWeights(40, 40, 20)
            ).to.be.revertedWith("Only DAO/Timelock");
        });
    });

    describe("Weight Impact on Scoring", function () {
        it("should affect final scores when weights change", async function () {
            // Submit initial proofs
            const tradFiSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_WEIGHT_" + Date.now());
            const tradFiJournal = ethers.utils.defaultAbiCoder.encode(
                ["tuple(string,string,string,string,string)"],
                [["750", "experian", "2024-01-15", "5 years", "excellent"]]
            );

            const tx1 = await creditSystem.connect(user1).submitTradFiProof(tradFiSeal, tradFiJournal);
            await tx1.wait();

            const initialProfile = await creditSystem.creditProfiles(user1.address);
            const initialScore = initialProfile.finalCreditScore.toNumber();

            // Change weights to favor TradFi more
            const tx2 = await creditSystem.updateScoringWeights(80, 10, 10);
            await tx2.wait();

            // Submit another proof to trigger recalculation
            const newSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_WEIGHT2_" + Date.now());
            const tx3 = await creditSystem.connect(user1).submitTradFiProof(newSeal, tradFiJournal);
            await tx3.wait();

            const newProfile = await creditSystem.creditProfiles(user1.address);
            const newScore = newProfile.finalCreditScore.toNumber();

            // Score should be different due to weight change
            expect(newScore).to.not.equal(initialScore);
        });
    });
});
