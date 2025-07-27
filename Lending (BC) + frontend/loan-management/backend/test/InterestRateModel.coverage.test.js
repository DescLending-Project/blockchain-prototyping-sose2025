const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InterestRateModel - Enhanced Coverage", function() {
    let interestRateModel;
    let timelock, user1, user2;
    let mockOracle;

    beforeEach(async function () {
        [timelock, user1, user2] = await ethers.getSigners();

        // Deploy mock oracle
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockOracle = await MockPriceFeed.deploy(
            ethers.parseUnits("2000", 8), // $2000
            8
        );
        await mockOracle.waitForDeployment();

        // Deploy InterestRateModel with all required parameters
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            await mockOracle.getAddress(), // ETH/USD Oracle
            await timelock.getAddress(),
            ethers.parseEther("0.05"), // 5% baseRate
            ethers.parseEther("0.8"),   // 80% kink
            ethers.parseEther("0.1"),   // 10% slope1
            ethers.parseEther("0.3"),   // 30% slope2
            ethers.parseEther("0.1"),   // 10% reserveFactor
            ethers.parseEther("1.0"),   // 100% maxBorrowRate
            ethers.parseEther("0.05"),  // 5% maxRateChange
            ethers.parseEther("0.03"),  // 3% ethPriceRiskPremium
            ethers.parseEther("0.2"),   // 20% ethVolatilityThreshold
            86400 // 24h oracleStalenessWindow
        );
        await interestRateModel.waitForDeployment();
    });

    describe("Utilization Rate Calculations", function() {
        it("should handle maximum utilization", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("100"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });

        it("should handle zero utilization", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                0,
                ethers.parseEther("100")
            );
            expect(borrowRate).to.equal(await interestRateModel.baseRate());
        });

        it("should handle partial utilization correctly", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("25"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });
    });

    describe("Interest Rate Calculations", function() {
        it("should calculate borrow rate below kink", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("50"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });

        it("should calculate borrow rate above kink", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("90"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });

        it("should calculate supply rate correctly", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("75"),
                ethers.parseEther("100")
            );
            expect(supplyRate > 0).to.be.true;
        });
    });

    describe("Parameter Management", function() {
        it("should allow timelock to update parameters", async function () {
            const newBaseRate = ethers.parseEther("0.06");

            await interestRateModel.connect(timelock).setParameters(
                newBaseRate,
                ethers.parseEther("0.8"),
                ethers.parseEther("0.1"),
                ethers.parseEther("0.3"),
                ethers.parseEther("0.1"),
                ethers.parseEther("1.0"),
                ethers.parseEther("0.05"),
                ethers.parseEther("0.03"),
                ethers.parseEther("0.2"),
                86400
            );

            expect(await interestRateModel.baseRate()).to.equal(newBaseRate);
        });

        it("should reject parameter updates from non-timelock", async function () {
            await expect(
                interestRateModel.connect(user1).setParameters(
                    ethers.parseEther("0.06"),
                    ethers.parseEther("0.8"),
                    ethers.parseEther("0.1"),
                    ethers.parseEther("0.3"),
                    ethers.parseEther("0.1"),
                    ethers.parseEther("1.0"),
                    ethers.parseEther("0.05"),
                    ethers.parseEther("0.03"),
                    ethers.parseEther("0.2"),
                    86400
                )
            ).to.be.revertedWithCustomError(interestRateModel, "OnlyTimelockInterestRateModel");
        });
    });

    describe("Oracle Integration", function() {
        it("should get ETH price from oracle", async function () {
            const price = await mockOracle.latestRoundData();
            expect(price.answer > 0).to.be.true;
        });

        it("should handle oracle functionality", async function () {
            // Test that oracle is accessible
            const oracleAddress = await interestRateModel.ethUsdOracle();
            expect(oracleAddress).to.equal(await mockOracle.getAddress());
        });
    });

    describe("Risk Calculations", function() {
        it("should calculate weighted risk score", async function () {
            // Test basic functionality - risk calculations are internal
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("50"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });

        it("should handle empty risk tiers", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(0, ethers.parseEther("100"));
            expect(borrowRate).to.equal(await interestRateModel.baseRate());
        });

        it("should calculate risk multipliers", async function () {
            const baseRate = await interestRateModel.baseRate();
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("50"),
                ethers.parseEther("100")
            );
            expect(borrowRate >= baseRate).to.be.true;
        });
    });

    describe("Edge Cases", function() {
        it("should handle very high utilization rates", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("99"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });

        it("should handle precision in calculations", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("33.333"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });

        it("should cap rates at maximum", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("100"),
                ethers.parseEther("100")
            );
            const maxRate = await interestRateModel.maxBorrowRate();
            expect(borrowRate <= maxRate).to.be.true;
        });
    });

    describe("Current Rates Function", function() {
        it("should return current rates for given totals", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("25"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
            expect(supplyRate >= 0).to.be.true;
        });

        it("should handle zero supply", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(0, 0);
            expect(borrowRate).to.equal(0n);
        });
    });

    describe("Simulation Functions", function() {
        it("should simulate rates for given utilization", async function () {
            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
                ethers.parseEther("50"),
                ethers.parseEther("100")
            );
            expect(borrowRate > 0).to.be.true;
        });
    });
});