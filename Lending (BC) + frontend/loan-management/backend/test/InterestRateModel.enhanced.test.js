const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InterestRateModel - Enhanced Coverage", function() {
    let interestRateModel;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy mock oracle first
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        const mockOracle = await MockPriceFeed.deploy(ethers.parseUnits("2000", 8), 8);
        await mockOracle.waitForDeployment();

        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            await mockOracle.getAddress(), // _ethUsdOracle
            owner.address, // _timelock
            ethers.parseUnits("0.02", 18), // _baseRate (2%)
            ethers.parseUnits("0.8", 18), // _kink (80%)
            ethers.parseUnits("0.05", 18), // _slope1 (5%)
            ethers.parseUnits("0.5", 18), // _slope2 (50%)
            ethers.parseUnits("0.1", 18), // _reserveFactor (10%)
            ethers.parseUnits("1.0", 18), // _maxBorrowRate (100%)
            ethers.parseUnits("0.1", 18), // _maxRateChange (10%)
            ethers.parseUnits("0.02", 18), // _ethPriceRiskPremium (2%)
            ethers.parseUnits("0.1", 18), // _ethVolatilityThreshold (10%)
            3600 // _oracleStalenessWindow (1 hour)
        );
        await interestRateModel.waitForDeployment();
    });

    describe("Edge Cases", function() {
        it("should handle maximum utilization", async function () {
            const maxUtilization = ethers.parseUnits("1", 18); // 100%
            const borrowRate = await interestRateModel.getBorrowRate(maxUtilization);
            expect(borrowRate).to.be > 0;
        });

        it("should handle zero utilization", async function () {
            const zeroUtilization = ethers.parseUnits("0", 18);
            const borrowRate = await interestRateModel.getBorrowRate(zeroUtilization);
            expect(borrowRate).to.equal(await interestRateModel.baseRate());
        });

        it("should handle extreme borrowed amounts", async function () {
            const extremeBorrowed = [
                ethers.parseEther("1000000"), // Very high
                ethers.parseEther("0"),       // Zero
                ethers.parseEther("1"),       // Low
                ethers.parseEther("100000")   // High
            ];

            for (const amount of extremeBorrowed) {
                const weightedScore = await interestRateModel.getWeightedRiskScore([amount, 0, 0, 0]);
                expect(weightedScore).to.be.gte(0);
            }
        });

        it("should calculate supply rates correctly", async function () {
            const utilizations = [
                ethers.parseUnits("0.1", 18),  // 10%
                ethers.parseUnits("0.5", 18),  // 50%
                ethers.parseUnits("0.9", 18),  // 90%
            ];

            for (const util of utilizations) {
                const borrowRate = await interestRateModel.getBorrowRate(util);
                const supplyRate = await interestRateModel.getSupplyRate(util, borrowRate);
                expect(supplyRate).to.be.lte(borrowRate);
            }
        });
    });

    describe("Risk Tier Calculations", function() {
        it("should handle all risk tiers", async function () {
            const borrowedByTier = [
                ethers.parseEther("100"), // TIER_1
                ethers.parseEther("200"), // TIER_2  
                ethers.parseEther("300"), // TIER_3
                ethers.parseEther("400")  // TIER_4
            ];

            const weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
            expect(weightedScore).to.be > 0;
        });

        it("should handle empty tiers", async function () {
            const emptyTiers = [0, 0, 0, 0];
            const weightedScore = await interestRateModel.getWeightedRiskScore(emptyTiers);
            expect(weightedScore).to.equal(0n);
        });
    });
});