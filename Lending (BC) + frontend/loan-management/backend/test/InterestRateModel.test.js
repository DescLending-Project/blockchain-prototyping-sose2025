const { expect } = require("chai");
const { ethers } = require("hardhat");
console.log('DEBUG: ethers =', ethers);

describe("InterestRateModel", function () {
    let owner, other, model, oracleMock;
    let baseRate, kink, slope1, slope2, reserveFactor, maxBorrowRate, maxRateChange, ethPriceRiskPremium, ethVolatilityThreshold, oracleStalenessWindow;

    beforeEach(async () => {
        [owner, other] = await ethers.getSigners();
        baseRate = ethers.parseUnits("0.02", 18); // 2%
        kink = ethers.parseUnits("0.8", 18); // 80%
        slope1 = ethers.parseUnits("0.20", 18); // 20%
        slope2 = ethers.parseUnits("1.00", 18); // 100%
        reserveFactor = ethers.parseUnits("0.10", 18); // 10%
        maxBorrowRate = ethers.parseUnits("2.00", 18); // 200%
        maxRateChange = ethers.parseUnits("0.05", 18); // 5%
        ethPriceRiskPremium = ethers.parseUnits("0.02", 18); // 2%
        ethVolatilityThreshold = ethers.parseUnits("0.05", 18); // 5%
        oracleStalenessWindow = 3600; // 1 hour
        // Deploy Chainlink oracle mock
        const OracleMock = await ethers.getContractFactory("OracleMock");
        oracleMock = await OracleMock.deploy();
        await oracleMock.waitForDeployment();
        // Deploy InterestRateModel
        const Model = await ethers.getContractFactory("InterestRateModel");
        const params = [
            baseRate,
            kink,
            slope1,
            slope2,
            reserveFactor,
            maxBorrowRate,
            maxRateChange,
            ethPriceRiskPremium,
            ethVolatilityThreshold,
            oracleStalenessWindow
        ];
        const ownerAddress = await owner.getAddress();
        const oracleAddress = await oracleMock.getAddress();
        model = await Model.deploy(
            ownerAddress,
            oracleAddress,
            params
        );
        await model.waitForDeployment();
    });

    it("deploys with correct parameters", async () => {
        expect(await model.baseRate()).to.equal(baseRate);
        expect(await model.kink()).to.equal(kink);
        expect(await model.slope1()).to.equal(slope1);
        expect(await model.slope2()).to.equal(slope2);
        expect(await model.reserveFactor()).to.equal(reserveFactor);
        expect(await model.maxBorrowRate()).to.equal(maxBorrowRate);
        expect(await model.ethUsdOracle()).to.equal(await oracleMock.getAddress());
    });

    it("only owner can set parameters", async () => {
        await expect(
            model.connect(other).setParameters(
                baseRate,
                kink,
                slope1,
                slope2,
                reserveFactor,
                maxBorrowRate,
                maxRateChange,
                ethPriceRiskPremium,
                ethVolatilityThreshold,
                oracleStalenessWindow
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await expect(
            model.setParameters(
                baseRate,
                kink,
                slope1,
                slope2,
                reserveFactor,
                maxBorrowRate,
                maxRateChange,
                ethPriceRiskPremium,
                ethVolatilityThreshold,
                oracleStalenessWindow
            )
        ).to.emit(model, "ParametersUpdated");
    });

    it("only owner can set protocol risk adjustment", async () => {
        await expect(
            model.connect(other).setProtocolRiskAdjustment(ethers.parseUnits("0.01", 18))
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await expect(model.setProtocolRiskAdjustment(ethers.parseUnits("0.01", 18)))
            .to.emit(model, "ParametersUpdated");
    });

    it("only owner can set oracle", async () => {
        await expect(model.connect(other).setOracle(other.address)).to.be.revertedWith("Ownable: caller is not the owner");
        await expect(model.setOracle(other.address)).to.emit(model, "OracleUpdated");
    });

    describe("Borrow rate calculation", () => {
        it("calculates below kink", async () => {
            // utilization = 40%
            const util = ethers.parseUnits("0.4", 18);
            const rate = await model.getBorrowRate(util);
            // rate = base + slope1 * (util / kink)
            const expected = baseRate + (slope1 * util) / kink;
            expect(rate).to.equal(expected);
        });
        it("calculates at kink", async () => {
            const util = kink;
            const rate = await model.getBorrowRate(util);
            // rate = base + slope1
            const expected = baseRate + slope1;
            expect(rate).to.equal(expected);
        });
        it("calculates above kink", async () => {
            // utilization = 90%
            const util = ethers.parseUnits("0.9", 18);
            const expected = baseRate + slope1 + (slope2 * (util - kink)) / (ethers.parseUnits("1", 18) - kink);
            const rate = await model.getBorrowRate(util);
            expect(rate).to.equal(expected);
        });
        it("applies protocol risk adjustment (positive)", async () => {
            await model.setProtocolRiskAdjustment(ethers.parseUnits("0.01", 18));
            const util = ethers.parseUnits("0.5", 18);
            const base = baseRate + (slope1 * util) / kink;
            const expected = base + ethers.parseUnits("0.01", 18);
            const rate = await model.getBorrowRate(util);
            expect(rate).to.equal(expected);
        });
        it("applies protocol risk adjustment (negative)", async () => {
            await model.setProtocolRiskAdjustment(ethers.parseUnits("-0.01", 18));
            const util = ethers.parseUnits("0.5", 18);
            const base = baseRate + (slope1 * util) / kink;
            const expected = base - ethers.parseUnits("0.01", 18);
            const rate = await model.getBorrowRate(util);
            expect(rate).to.equal(expected);
        });
        it("caps rate at maxBorrowRate", async () => {
            // utilization = 100%
            const util = ethers.parseUnits("1.0", 18);
            // The contract logic: rate = baseRate + slope1 + (slope2 * (util - kink)) / (1e18 - kink)
            let rate = baseRate + slope1 + (slope2 * (util - kink)) / (ethers.parseUnits("1", 18) - kink);
            if (rate > maxBorrowRate) rate = maxBorrowRate;
            const contractRate = await model.getBorrowRate(util);
            expect(contractRate).to.equal(rate);
        });
    });

    describe("Supply rate calculation", () => {
        it("calculates supply rate correctly", async () => {
            const util = ethers.parseUnits("0.5", 18);
            const borrowRate = await model.getBorrowRate(util);
            const expected = (util * borrowRate * ethers.parseUnits("0.9", 18)) / ethers.parseUnits("1", 36);
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            expect(supplyRate).to.equal(expected);
        });
        it("is zero if utilization is zero", async () => {
            const util = ethers.parseUnits("0", 18);
            const borrowRate = await model.getBorrowRate(util);
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            expect(supplyRate).to.equal(0);
        });
    });

    describe("Oracle integration", () => {
        it("returns ETH price and updatedAt", async () => {
            // Set price to 2000e8, updatedAt to now
            const price = ethers.parseUnits("200000000000", 8); // 2000 * 1e8
            const now = Math.floor(Date.now() / 1000);
            await oracleMock.setLatestRoundData(price, now);
            const [ethPrice, updatedAt] = await model.getEthPrice();
            expect(ethPrice).to.equal(price);
            expect(updatedAt).to.equal(now);
        });
        it("reverts if oracle is stale", async () => {
            const price = ethers.parseUnits("200000000000", 8);
            const oldTime = Math.floor(Date.now() / 1000) - 4000;
            await oracleMock.setLatestRoundData(price, oldTime);
            await expect(model.getEthPrice()).to.be.revertedWith("Stale oracle");
        });
        it("reverts if oracle not set", async () => {
            const Model = await ethers.getContractFactory("InterestRateModel");
            const params = [
                baseRate,
                kink,
                slope1,
                slope2,
                reserveFactor,
                maxBorrowRate,
                maxRateChange,
                ethPriceRiskPremium,
                ethVolatilityThreshold,
                oracleStalenessWindow
            ];
            const ownerAddress = await owner.getAddress();
            const model2 = await Model.deploy(
                ownerAddress,
                ethers.ZeroAddress,
                params
            );
            await model2.waitForDeployment();
            await expect(model2.getEthPrice()).to.be.revertedWith("Oracle not set");
        });
    });

    describe("View functions", () => {
        it("getCurrentRates returns correct rates", async () => {
            // totalBorrowed = 50, totalSupplied = 100
            const totalBorrowed = ethers.parseUnits("50", 18);
            const totalSupplied = ethers.parseUnits("100", 18);
            const util = (totalBorrowed * ethers.parseUnits("1", 18)) / totalSupplied;
            const borrowRate = await model.getBorrowRate(util);
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            const [br, sr] = await model.getCurrentRates(totalBorrowed, totalSupplied);
            expect(br).to.equal(borrowRate);
            expect(sr).to.equal(supplyRate);
        });
        it("simulateRates returns correct rates", async () => {
            const util = ethers.parseUnits("0.7", 18);
            const borrowRate = await model.getBorrowRate(util);
            const supplyRate = await model.getSupplyRate(util, borrowRate);
            const [br, sr] = await model.simulateRates(util);
            expect(br).to.equal(borrowRate);
            expect(sr).to.equal(supplyRate);
        });
    });
}); 