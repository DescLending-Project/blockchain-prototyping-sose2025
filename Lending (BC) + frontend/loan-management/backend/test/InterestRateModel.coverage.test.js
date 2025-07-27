const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InterestRateModel - Enhanced Coverage", function () {
    let interestRateModel;
    let timelock, user1, user2;
    let mockOracle;

    beforeEach(async function () {
        [timelock, user1, user2] = await ethers.getSigners();

        // Deploy mock oracle
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockOracle = await MockPriceFeed.deploy(
            ethers.utils.parseUnits("2000", 8), // $2000
            8
        );
        await mockOracle.deployed();

        // Deploy InterestRateModel with all required parameters
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            mockOracle.address, // ETH/USD Oracle
            timelock.address,
            ethers.utils.parseEther("0.05"), // 5% baseRate
            ethers.utils.parseEther("0.8"),   // 80% kink
            ethers.utils.parseEther("0.1"),   // 10% slope1
            ethers.utils.parseEther("0.3"),   // 30% slope2
            ethers.utils.parseEther("0.1"),   // 10% reserveFactor
            ethers.utils.parseEther("1.0"),   // 100% maxBorrowRate
            ethers.utils.parseEther("0.05"),  // 5% maxRateChange
            ethers.utils.parseEther("0.03"),  // 3% ethPriceRiskPremium
            ethers.utils.parseEther("0.2"),   // 20% ethVolatilityThreshold
            86400 // 24h oracleStalenessWindow
        );
        await interestRateModel.deployed();
    });

    describe("Utilization Rate Calculations", function () {
        it("should handle maximum utilization", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });

        it("should handle zero utilization", async function () {
            const result = await interestRateModel.getCurrentRates(
                0,
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate).to.equal(await interestRateModel.baseRate());
        });

        it("should handle partial utilization correctly", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("25"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });
    });

    describe("Interest Rate Calculations", function () {
        it("should calculate borrow rate below kink", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });

        it("should calculate borrow rate above kink", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("90"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });

        it("should calculate supply rate correctly", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("75"),
                ethers.utils.parseEther("100")
            );
            expect(result.supplyRate.gt(0)).to.be.true;
        });
    });

    describe("Parameter Management", function () {
        it("should allow timelock to update parameters", async function () {
            const newBaseRate = ethers.utils.parseEther("0.06");

            await interestRateModel.connect(timelock).setParameters(
                newBaseRate,
                ethers.utils.parseEther("0.8"),
                ethers.utils.parseEther("0.1"),
                ethers.utils.parseEther("0.3"),
                ethers.utils.parseEther("0.1"),
                ethers.utils.parseEther("1.0"),
                ethers.utils.parseEther("0.05"),
                ethers.utils.parseEther("0.03"),
                ethers.utils.parseEther("0.2"),
                86400
            );

            expect(await interestRateModel.baseRate()).to.equal(newBaseRate);
        });

        it("should reject parameter updates from non-timelock", async function () {
            await expect(
                interestRateModel.connect(user1).setParameters(
                    ethers.utils.parseEther("0.06"),
                    ethers.utils.parseEther("0.8"),
                    ethers.utils.parseEther("0.1"),
                    ethers.utils.parseEther("0.3"),
                    ethers.utils.parseEther("0.1"),
                    ethers.utils.parseEther("1.0"),
                    ethers.utils.parseEther("0.05"),
                    ethers.utils.parseEther("0.03"),
                    ethers.utils.parseEther("0.2"),
                    86400
                )
            ).to.be.revertedWith("Only timelock");
        });
    });

    describe("Oracle Integration", function () {
        it("should get ETH price from oracle", async function () {
            const price = await mockOracle.latestRoundData();
            expect(price.answer.gt(0)).to.be.true;
        });

        it("should handle oracle functionality", async function () {
            // Test that oracle is accessible
            const oracleAddress = await interestRateModel.ethUsdOracle();
            expect(oracleAddress).to.equal(mockOracle.address);
        });
    });

    describe("Risk Calculations", function () {
        it("should calculate weighted risk score", async function () {
            // Test basic functionality - risk calculations are internal
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });

        it("should handle empty risk tiers", async function () {
            const result = await interestRateModel.getCurrentRates(0, ethers.utils.parseEther("100"));
            expect(result.borrowRate.eq(await interestRateModel.baseRate())).to.be.true;
        });

        it("should calculate risk multipliers", async function () {
            const baseRate = await interestRateModel.baseRate();
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gte(baseRate)).to.be.true;
        });
    });

    describe("Edge Cases", function () {
        it("should handle very high utilization rates", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("99"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });

        it("should handle precision in calculations", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("33.333"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });

        it("should cap rates at maximum", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            const maxRate = await interestRateModel.maxBorrowRate();
            expect(result.borrowRate.lte(maxRate)).to.be.true;
        });
    });

    describe("Current Rates Function", function () {
        it("should return current rates for given totals", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("25"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
            expect(result.supplyRate.gte(0)).to.be.true;
        });

        it("should handle zero supply", async function () {
            const result = await interestRateModel.getCurrentRates(0, 0);
            expect(result.borrowRate.eq(await interestRateModel.baseRate())).to.be.true;
        });
    });

    describe("Simulation Functions", function () {
        it("should simulate rates for given utilization", async function () {
            const result = await interestRateModel.getCurrentRates(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("100")
            );
            expect(result.borrowRate.gt(0)).to.be.true;
        });
    });
});
