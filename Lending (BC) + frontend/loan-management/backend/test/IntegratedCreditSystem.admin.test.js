const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IntegratedCreditSystem - Admin Tests", function() {
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
            await mockRisc0Verifier.getAddress(),
            await mockLiquidityPool.getAddress()
        );
        await creditSystem.waitForDeployment();
    });

    describe("Admin Functions", function() {
        it("should update scoring weights (admin only)", async function () {
            const tx = await creditSystem.connect(owner).updateScoringWeights(40, 40, 20);
            await tx.wait();

            const [tradFi, account, nesting] = await Promise.all([
                creditSystem.tradFiWeight(),
                creditSystem.accountWeight(),
                creditSystem.nestingWeight()
            ]);

            expect(tradFi).to.equal(40n);
            expect(account).to.equal(40n);
            expect(nesting).to.equal(20n);
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

                expect(tradFi).to.equal(BigInt(weights[0]));
                expect(account).to.equal(BigInt(weights[1]));
                expect(nesting).to.equal(BigInt(weights[2]));
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

    describe("Access Control", function() {
        it("should only allow timelock to update weights", async function () {
            const tx = await creditSystem.connect(owner).updateScoringWeights(40, 40, 20);
            await tx.wait();

            await expect(
                creditSystem.connect(user1).updateScoringWeights(40, 40, 20)
            ).to.be.revertedWith("Only DAO/Timelock");
        });

        it("should allow liquidity pool address to update weights", async function () {
            // Impersonate the liquidity pool contract
            const liquidityPoolAddress = await mockLiquidityPool.getAddress();
            await network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [liquidityPoolAddress],
            });

            const liquidityPoolSigner = await ethers.getSigner(liquidityPoolAddress);

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

            expect(tradFi).to.equal(30n);
            expect(account).to.equal(30n);
            expect(nesting).to.equal(40n);
        });
    });

    describe("Weight Impact on Scoring", function() {
        it("should affect final scores when weights change", async function () {
            // Submit initial proofs
            const tradFiSeal = ethers.toUtf8Bytes("MOCK_TRADFI_SEAL_WEIGHT_" + Date.now());
            const tradFiJournal = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(string,string,string,string,string)"],
                [["750", "experian", "2024-01-15", "5 years", "excellent"]]
            );

            const tx1 = await creditSystem.connect(user1).submitTradFiProof(tradFiSeal, tradFiJournal);
            await tx1.wait();

            const initialProfile = await creditSystem.creditProfiles(user1.address);
            const initialScore = Number(initialProfile.finalCreditScore);

            // Change weights to favor TradFi more
            const tx2 = await creditSystem.updateScoringWeights(80, 10, 10);
            await tx2.wait();

            // Submit another proof to trigger recalculation
            const newSeal = ethers.utils.toUtf8Bytes("MOCK_TRADFI_SEAL_WEIGHT2_" + Date.now());
            const tx3 = await creditSystem.connect(user1).submitTradFiProof(newSeal, tradFiJournal);
            await tx3.wait();

            const newProfile = await creditSystem.creditProfiles(user1.address);
            const newScore = Number(newProfile.finalCreditScore);

            // Score should be different due to weight change
            expect(newScore).to.not.equal(initialScore);
        });
    });
});