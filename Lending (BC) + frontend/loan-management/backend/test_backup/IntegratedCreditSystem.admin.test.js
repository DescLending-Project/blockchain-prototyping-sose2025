const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IntegratedCreditSystem - Admin Tests", function () {
    let creditSystem, mockRisc0Verifier, mockLiquidityPool;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        // Deploy mock contracts
        const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
        mockRisc0Verifier = await MockRiscZeroVerifier.deploy();
        await mockRisc0Verifier.waitForDeployment();

        const MockLiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
        mockLiquidityPool = await MockLiquidityPool.deploy();
        await mockLiquidityPool.waitForDeployment();

        // Set timelock in mock liquidity pool
        await mockLiquidityPool.setTimelock(owner.address);

        // Deploy IntegratedCreditSystem
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        creditSystem = await IntegratedCreditSystem.deploy(
            mockRisc0Verifier.address,
            mockLiquidityPool.address
        );
        await creditSystem.waitForDeployment();
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

        it("should emit ScoringWeightsUpdated event", async function () {
            await expect(
                creditSystem.connect(owner).updateScoringWeights(40, 40, 20)
            ).to.emit(creditSystem, "ScoringWeightsUpdated")
                .withArgs(40, 40, 20);
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

        it("should allow liquidity pool address to update weights", async function () {
            // Impersonate the liquidity pool contract
            await network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [mockLiquidityPool.address],
            });

            const liquidityPoolSigner = await ethers.getSigner(mockLiquidityPool.address);

            // Fund the impersonated account
            await owner.sendTransaction({
                to: mockLiquidityPool.address,
                value: ethers.parseEther("1")
            });

            const tx = await creditSystem.connect(liquidityPoolSigner).updateScoringWeights(30, 30, 40);
            await tx.wait();

            const [tradFi, account, nesting] = await Promise.all([
                creditSystem.tradFiWeight(),
                creditSystem.accountWeight(),
                creditSystem.nestingWeight()
            ]);

            expect(tradFi.toNumber()).to.equal(30);
            expect(account.toNumber()).to.equal(30);
            expect(nesting.toNumber()).to.equal(40);
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