const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InterestRateModel - Enhanced Coverage", function () {
    let interestRateModel;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy();
        await interestRateModel.deployed();
    });

    describe("Edge Cases", function () {
        it("should handle maximum utilization", async function () {
            const maxUtilization = ethers.utils.parseUnits("1", 18); // 100%
            const borrowRate = await interestRateModel.getBorrowRate(maxUtilization);
            expect(borrowRate).to.be.gt(0);
        });

        it("should handle zero utilization", async function () {
            const zeroUtilization = ethers.utils.parseUnits("0", 18);
            const borrowRate = await interestRateModel.getBorrowRate(zeroUtilization);
            expect(borrowRate).to.equal(await interestRateModel.baseRate());
        });

        it("should handle extreme borrowed amounts", async function () {
            const extremeBorrowed = [
                ethers.utils.parseEther("1000000"), // Very high
                ethers.utils.parseEther("0"),       // Zero
                ethers.utils.parseEther("1"),       // Low
                ethers.utils.parseEther("100000")   // High
            ];

            for (const amount of extremeBorrowed) {
                const weightedScore = await interestRateModel.getWeightedRiskScore([amount, 0, 0, 0]);
                expect(weightedScore).to.be.gte(0);
            }
        });

        it("should calculate supply rates correctly", async function () {
            const utilizations = [
                ethers.utils.parseUnits("0.1", 18),  // 10%
                ethers.utils.parseUnits("0.5", 18),  // 50%
                ethers.utils.parseUnits("0.9", 18),  // 90%
            ];

            for (const util of utilizations) {
                const borrowRate = await interestRateModel.getBorrowRate(util);
                const supplyRate = await interestRateModel.getSupplyRate(util, borrowRate);
                expect(supplyRate).to.be.lte(borrowRate);
            }
        });
    });

    describe("Risk Tier Calculations", function () {
        it("should handle all risk tiers", async function () {
            const borrowedByTier = [
                ethers.utils.parseEther("100"), // TIER_1
                ethers.utils.parseEther("200"), // TIER_2  
                ethers.utils.parseEther("300"), // TIER_3
                ethers.utils.parseEther("400")  // TIER_4
            ];

            const weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
            expect(weightedScore).to.be.gt(0);
        });

        it("should handle empty tiers", async function () {
            const emptyTiers = [0, 0, 0, 0];
            const weightedScore = await interestRateModel.getWeightedRiskScore(emptyTiers);
            expect(weightedScore).to.equal(0);
        });
    });
});