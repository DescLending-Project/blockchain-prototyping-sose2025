const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InterestRateModel - Coverage Boost", function () {
    let interestRateModel, oracleMock;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        // Deploy Oracle Mock
        const OracleMock = await ethers.getContractFactory("OracleMock");
        oracleMock = await OracleMock.deploy();
        await oracleMock.deployed();

        // Deploy InterestRateModel with correct 12 parameters
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            oracleMock.address,
            owner.address,
            "50000000000000000", // 5% baseRate (0.05 * 1e18)
            "800000000000000000", // 80% kink (0.8 * 1e18)
            "100000000000000000", // 10% slope1 (0.1 * 1e18)
            "300000000000000000", // 30% slope2 (0.3 * 1e18)
            "100000000000000000", // 10% reserveFactor (0.1 * 1e18)
            "1000000000000000000", // 100% maxBorrowRate (1.0 * 1e18)
            "50000000000000000", // 5% maxRateChange (0.05 * 1e18)
            "30000000000000000", // 3% ethPriceRiskPremium (0.03 * 1e18)
            "200000000000000000", // 20% ethVolatilityThreshold (0.2 * 1e18)
            86400 // 24h oracleStalenessWindow (in seconds)
        );
        await interestRateModel.deployed();
    });

    // Test edge cases to hit uncovered lines
    it("should handle zero kink edge case", async function () {
        // Deploy with zero kink to test division by zero protection
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const zeroKinkModel = await InterestRateModel.deploy(
            oracleMock.address,
            owner.address,
            "50000000000000000",
            "0", // Zero kink
            "100000000000000000",
            "300000000000000000",
            "100000000000000000",
            "1000000000000000000",
            "50000000000000000",
            "30000000000000000",
            "200000000000000000",
            86400
        );
        await zeroKinkModel.deployed();

        // This should work without reverting - the contract handles zero kink gracefully
        const rate = await zeroKinkModel.getBorrowRate(ethers.utils.parseUnits("0.5", 18));
        expect(rate.gt(0)).to.be.true;
    });

    it("should handle invalid kink value edge case", async function () {
        // Deploy with kink > 1e18 to test invalid kink protection
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const invalidKinkModel = await InterestRateModel.deploy(
            oracleMock.address,
            owner.address,
            "50000000000000000",
            "1100000000000000000", // 110% kink (> 1e18)
            "100000000000000000",
            "300000000000000000",
            "100000000000000000",
            "1000000000000000000",
            "50000000000000000",
            "30000000000000000",
            "200000000000000000",
            86400
        );
        await invalidKinkModel.deployed();

        // This should work - the contract handles high kink values
        const rate = await invalidKinkModel.getBorrowRate(ethers.utils.parseUnits("0.9", 18));
        expect(rate.gt(0)).to.be.true;
    });

    it("should handle zero total supplied in getCurrentRates", async function () {
        // This should return (0, 0) when totalSupplied is 0
        const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(
            ethers.utils.parseEther("10"),
            "0" // Zero total supplied
        );
        expect(borrowRate.eq(0)).to.be.true;
        expect(supplyRate.eq(0)).to.be.true;
    });

    it("should handle oracle not set error", async function () {
        // Deploy with zero oracle address
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const noOracleModel = await InterestRateModel.deploy(
            ethers.constants.AddressZero, // No oracle
            owner.address,
            "50000000000000000",
            "800000000000000000",
            "100000000000000000",
            "300000000000000000",
            "100000000000000000",
            "1000000000000000000",
            "50000000000000000",
            "30000000000000000",
            "200000000000000000",
            86400
        );
        await noOracleModel.deployed();

        try {
            await noOracleModel.getEthPrice();
            expect.fail("Should have reverted");
        } catch (error) {
            expect(error.message).to.include("OracleNotSet");
        }
    });

    it("should handle stale oracle error", async function () {
        // Set oracle staleness window to 1 second
        await interestRateModel.setParameters(
            "50000000000000000",
            "800000000000000000",
            "100000000000000000",
            "300000000000000000",
            "100000000000000000",
            "1000000000000000000",
            "50000000000000000",
            "30000000000000000",
            "200000000000000000",
            "1" // 1 second staleness window
        );

        // Wait 2 seconds
        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");

        try {
            await interestRateModel.getEthPrice();
            expect.fail("Should have reverted");
        } catch (error) {
            expect(error.message).to.include("StaleOracle");
        }
    });

    it("should handle basic rate calculations", async function () {
        // Test at 0% utilization
        const rate0 = await interestRateModel.getBorrowRate(0);
        expect(rate0.gt(0)).to.be.true;

        // Test at 50% utilization
        const rate50 = await interestRateModel.getBorrowRate(ethers.utils.parseUnits("0.5", 18));
        expect(rate50.gt(rate0)).to.be.true;

        // Test at 90% utilization (above kink)
        const rate90 = await interestRateModel.getBorrowRate(ethers.utils.parseUnits("0.9", 18));
        expect(rate90.gt(rate50)).to.be.true;
    });

    it("should handle supply rate calculations", async function () {
        const utilization = ethers.utils.parseUnits("0.5", 18);
        const borrowRate = await interestRateModel.getBorrowRate(utilization);
        const supplyRate = await interestRateModel.getSupplyRate(utilization, borrowRate);
        expect(supplyRate.gt(0)).to.be.true;
    });

    it("should handle weighted risk score calculations", async function () {
        const borrowedByTier = [
            ethers.utils.parseEther("1"), // TIER_1
            ethers.utils.parseEther("2"), // TIER_2
            ethers.utils.parseEther("3"), // TIER_3
            ethers.utils.parseEther("4")  // TIER_4
        ];
        const weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
        expect(weightedScore.gt(0)).to.be.true;
    });

    it("should handle risk multiplier calculations", async function () {
        const riskMult0 = await interestRateModel.getRiskMultiplier(0);
        expect(riskMult0.eq(ethers.utils.parseUnits("1", 18))).to.be.true;

        const riskMult1 = await interestRateModel.getRiskMultiplier(1);
        expect(riskMult1.eq(ethers.utils.parseUnits("0.9", 18))).to.be.true;
    });

    it("should handle repayment ratio calculations", async function () {
        const ratio = await interestRateModel.getRepaymentRatio(
            ethers.utils.parseEther("100"),
            ethers.utils.parseEther("80")
        );
        expect(ratio.eq(ethers.utils.parseUnits("0.8", 18))).to.be.true;
    });

    it("should handle global risk multiplier", async function () {
        const riskMult = ethers.utils.parseUnits("1.1", 18);
        const repayMult = ethers.utils.parseUnits("1.2", 18);
        const globalMult = await interestRateModel.getGlobalRiskMultiplier(riskMult, repayMult);
        expect(globalMult.gt(0)).to.be.true;
    });

    it("should handle parameter updates", async function () {
        await interestRateModel.setParameters(
            "60000000000000000", // 6% baseRate
            "750000000000000000", // 75% kink
            "120000000000000000", // 12% slope1
            "350000000000000000", // 35% slope2
            "120000000000000000", // 12% reserveFactor
            "1200000000000000000", // 120% maxBorrowRate
            "60000000000000000", // 6% maxRateChange
            "40000000000000000", // 4% ethPriceRiskPremium
            "250000000000000000", // 25% ethVolatilityThreshold
            172800 // 48h oracleStalenessWindow
        );

        expect((await interestRateModel.baseRate()).eq("60000000000000000")).to.be.true;
        expect((await interestRateModel.kink()).eq("750000000000000000")).to.be.true;
    });

    it("should handle oracle updates", async function () {
        const newOracle = user1.address;
        await interestRateModel.setOracle(newOracle);

        expect(await interestRateModel.ethUsdOracle()).to.equal(newOracle);
    });

    it("should handle protocol risk adjustment", async function () {
        await interestRateModel.setProtocolRiskAdjustment(100);

        expect((await interestRateModel.protocolRiskAdjustment()).eq(100)).to.be.true;
    });
});
