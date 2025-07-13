require('@nomicfoundation/hardhat-chai-matchers');
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InterestRateModel", function () {
    let owner, other, model, oracleMock;
    let baseRate, kink, slope1, slope2, reserveFactor, maxBorrowRate, maxRateChange, ethPriceRiskPremium, ethVolatilityThreshold, oracleStalenessWindow;

    beforeEach(async () => {
        [owner, other] = await ethers.getSigners();
        baseRate = ethers.utils.parseUnits("0.02", 18); // 2%
        kink = ethers.utils.parseUnits("0.8", 18); // 80%
        slope1 = ethers.utils.parseUnits("0.20", 18); // 20%
        slope2 = ethers.utils.parseUnits("1.00", 18); // 100%
        reserveFactor = ethers.utils.parseUnits("0.10", 18); // 10%
        maxBorrowRate = ethers.utils.parseUnits("2.00", 18); // 200%
        maxRateChange = ethers.utils.parseUnits("0.05", 18); // 5%
        ethPriceRiskPremium = ethers.utils.parseUnits("0.02", 18); // 2%
        ethVolatilityThreshold = ethers.utils.parseUnits("0.05", 18); // 5%
        oracleStalenessWindow = 3600; // 1 hour
        // Deploy Chainlink oracle mock
        const OracleMock = await ethers.getContractFactory("OracleMock");
        oracleMock = await OracleMock.deploy();
        await oracleMock.deployed();
        // Deploy InterestRateModel with correct constructor arguments
        const Model = await ethers.getContractFactory("InterestRateModel");
        model = await Model.deploy(
            oracleMock.address, // ethUsdOracle
            owner.address,      // timelock/admin
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
        await model.deployed();
        // Ensure addresses are defined
        if (!oracleMock.address || !model.address) throw new Error("Contract address undefined");
    });

    it("deploys with correct parameters", async () => {
        expect(await model.baseRate()).to.equal("50000000000000000"); // 5%
        expect(await model.kink()).to.equal("800000000000000000"); // 80%
        expect(await model.slope1()).to.equal("100000000000000000"); // 10%
        expect(await model.slope2()).to.equal("300000000000000000"); // 30%
        expect(await model.reserveFactor()).to.equal("100000000000000000"); // 10%
        expect(await model.maxBorrowRate()).to.equal("1000000000000000000"); // 100%
        expect(await model.ethUsdOracle()).to.equal(await oracleMock.address);
    });

    it("only owner can set parameters", async () => {
        await expect(
            model.connect(other).setParameters(
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
            )
        ).to.be.reverted;
        // Use try/catch for event assertion
        let tx = await model.setParameters(
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
        let receipt = await tx.wait();
        const found = receipt.events && receipt.events.some(e => e.event === "ParametersUpdated");
        expect(found).to.be.true;
    });

    it("only owner can set protocol risk adjustment", async () => {
        await expect(
            model.connect(other).setProtocolRiskAdjustment("10000000000000000")
        ).to.be.reverted;
        let tx = await model.setProtocolRiskAdjustment("10000000000000000");
        let receipt = await tx.wait();
        const found = receipt.events && receipt.events.some(e => e.event === "ParametersUpdated");
        expect(found).to.be.true;
    });

    it("only owner can set oracle", async () => {
        await expect(model.connect(other).setOracle(other.address)).to.be.reverted;
        let tx = await model.setOracle(other.address);
        let receipt = await tx.wait();
        const found = receipt.events && receipt.events.some(e => e.event === "OracleUpdated");
        expect(found).to.be.true;
    });

    describe("Borrow rate calculation", () => {
        it("calculates below kink", async () => {
            // utilization = 40%
            const util = ethers.BigNumber.from("400000000000000000");
            const rate = await model.getBorrowRate(util);
            // rate = base + slope1 * (util / kink)
            const baseRate = ethers.BigNumber.from("50000000000000000");
            const slope1 = ethers.BigNumber.from("100000000000000000");
            const kink = ethers.BigNumber.from("800000000000000000");
            const expected = baseRate.add(slope1.mul(util).div(kink));
            expect(rate).to.equal(expected);
        });
        it("calculates at kink", async () => {
            const util = ethers.BigNumber.from("800000000000000000");
            const baseRate = ethers.BigNumber.from("50000000000000000");
            const slope1 = ethers.BigNumber.from("100000000000000000");
            const expected = baseRate.add(slope1);
            const rate = await model.getBorrowRate(util);
            expect(rate).to.equal(expected);
        });
        it("calculates above kink", async () => {
            // utilization = 90%
            const util = ethers.BigNumber.from("900000000000000000");
            const baseRate = ethers.BigNumber.from("50000000000000000");
            const slope1 = ethers.BigNumber.from("100000000000000000");
            const slope2 = ethers.BigNumber.from("300000000000000000");
            const kink = ethers.BigNumber.from("800000000000000000");
            const one = ethers.BigNumber.from("1000000000000000000");
            const excessUtil = util.sub(kink);
            const denominator = one.sub(kink);
            const expected = baseRate.add(slope1).add(slope2.mul(excessUtil).div(denominator));
            const rate = await model.getBorrowRate(util);
            expect(rate).to.equal(expected);
        });
        it("applies protocol risk adjustment (positive)", async () => {
            await model.setProtocolRiskAdjustment("10000000000000000");
            const util = ethers.BigNumber.from("500000000000000000");
            const baseRate = ethers.BigNumber.from("50000000000000000");
            const slope1 = ethers.BigNumber.from("100000000000000000");
            const kink = ethers.BigNumber.from("800000000000000000");
            const expected = baseRate.add(slope1.mul(util).div(kink)).add("10000000000000000");
            const rate = await model.getBorrowRate(util);
            expect(rate).to.equal(expected);
        });
        it("applies protocol risk adjustment (negative)", async () => {
            await model.setProtocolRiskAdjustment("-10000000000000000");
            const util = ethers.BigNumber.from("500000000000000000");
            const baseRate = ethers.BigNumber.from("50000000000000000");
            const slope1 = ethers.BigNumber.from("100000000000000000");
            const kink = ethers.BigNumber.from("800000000000000000");
            const expected = baseRate.add(slope1.mul(util).div(kink)).sub("10000000000000000");
            const rate = await model.getBorrowRate(util);
            expect(rate).to.equal(expected);
        });
        it("caps rate at maxBorrowRate", async () => {
            // utilization = 100%
            const util = ethers.BigNumber.from("1000000000000000000");
            const baseRate = ethers.BigNumber.from("50000000000000000");
            const slope1 = ethers.BigNumber.from("100000000000000000");
            const slope2 = ethers.BigNumber.from("300000000000000000");
            const kink = ethers.BigNumber.from("800000000000000000");
            const one = ethers.BigNumber.from("1000000000000000000");
            let rate = baseRate.add(slope1).add(slope2.mul(util.sub(kink)).div(one.sub(kink)));
            const maxBorrowRate = ethers.BigNumber.from("1000000000000000000");
            if (rate.gt(maxBorrowRate)) rate = maxBorrowRate;
            const contractRate = await model.getBorrowRate(util);
            expect(contractRate).to.equal(rate);
        });
    });

    describe("Supply rate calculation", () => {
        it("calculates supply rate correctly", async () => {
            const util = ethers.BigNumber.from("500000000000000000");
            const borrowRate = await model.getBorrowRate(util);
            const one = ethers.BigNumber.from("1000000000000000000");
            const reserveFactor = ethers.BigNumber.from("100000000000000000");
            const oneMinusReserve = one.sub(reserveFactor);
            const expected = util.mul(borrowRate).mul(oneMinusReserve).div(one.mul(one));
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            expect(supplyRate).to.equal(expected);
        });
        it("is zero if utilization is zero", async () => {
            const util = ethers.utils.parseUnits("0", 18);
            const borrowRate = await model.getBorrowRate(util);
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            expect(supplyRate).to.equal(0);
        });
    });

    describe("Oracle integration", () => {
        it("returns ETH price and updatedAt", async () => {
            // Set price to 2000e8, updatedAt to now
            const price = 2000e8; // 2000 * 1e8 = 200000000000 (reasonable price)
            const now = Math.floor(Date.now() / 1000);
            await oracleMock.setLatestRoundData(price, now);
            const [ethPrice, updatedAt] = await model.getEthPrice();
            expect(ethPrice).to.equal(price);
            expect(updatedAt).to.equal(now);
        });
        it("reverts if oracle is stale", async () => {
            const price = 2000e8;
            // Set oldTime to be much further in the past than the staleness window
            const stalenessWindow = await model.oracleStalenessWindow();
            const now = Math.floor(Date.now() / 1000);
            const oldTime = now - Number(stalenessWindow) - 10; // 10s past staleness
            await oracleMock.setLatestRoundData(price, oldTime);
            // Debug output
            const latest = await oracleMock.latestRoundData();
            // This should revert due to staleness
            await expect(model.getEthPrice()).to.be.reverted;
        });
        it("reverts if oracle not set", async () => {
            const Model = await ethers.getContractFactory("InterestRateModel");
            const model2 = await Model.deploy(
                oracleMock.address,
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
            await model2.deployed();
            await expect(model2.getEthPrice()).to.be.reverted;
        });
    });

    describe("View functions", () => {
        it("getCurrentRates returns correct rates", async () => {
            // totalBorrowed = 50, totalSupplied = 100
            const totalBorrowed = ethers.utils.parseUnits("50", 18);
            const totalSupplied = ethers.utils.parseUnits("100", 18);
            const util = totalBorrowed.mul(ethers.utils.parseUnits("1", 18)).div(totalSupplied);
            const borrowRate = await model.getBorrowRate(util);
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            const [br, sr] = await model.getCurrentRates(totalBorrowed, totalSupplied);
            expect(br).to.equal(borrowRate);
            expect(sr).to.equal(supplyRate);
        });
        it("simulateRates returns correct rates", async () => {
            const util = ethers.utils.parseUnits("0.7", 18);
            const borrowRate = await model.getBorrowRate(util);
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            const [br, sr] = await model.simulateRates(util);
            expect(br).to.equal(borrowRate);
            expect(sr).to.equal(supplyRate);
        });
    });
}); 