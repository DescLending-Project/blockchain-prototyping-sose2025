const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Comprehensive Coverage", function() {
    let stablecoinManager, timelock, mockToken;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Use owner as timelock for testing
        timelock = owner;

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(owner.address);
        await stablecoinManager.waitForDeployment();

        // Deploy mock token
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock USDC", "MUSDC");
        await mockToken.waitForDeployment();
    });

    describe("Initialization", function() {
        it("should initialize with correct parameters", async function () {
            expect(await stablecoinManager.timelock()).to.equal(timelock.address);
        });

        it("should have empty stablecoin list initially", async function () {
            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.false;
        });
    });

    describe("Stablecoin Management", function() {
        it("should allow timelock to add stablecoins", async function () {
            await stablecoinManager.connect(timelock).setStablecoinParams(
                await mockToken.getAddress(),
                true,  // isStable
                85,    // LTV
                110    // liquidationThreshold
            );

            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.true;
            expect(await stablecoinManager.getLTV(await mockToken.getAddress())).to.equal(85n);
            expect(await stablecoinManager.getLiquidationThreshold(await mockToken.getAddress())).to.equal(110n);
        });

        it("should allow timelock to remove stablecoins", async function () {
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 85, 110);
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), false, 85, 110);

            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.false;
        });

        it("should allow threshold updates", async function () {
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 85, 110);

            // Update with new threshold
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 85, 115);
            expect(await stablecoinManager.getLiquidationThreshold(await mockToken.getAddress())).to.equal(115n);

            // Update with new LTV
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 80, 115);
            expect(await stablecoinManager.getLTV(await mockToken.getAddress())).to.equal(80n);
        });

        it("should reject unauthorized operations", async function () {
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(await mockToken.getAddress(), true, 85, 110)
            ).to.be.revertedWithCustomError(stablecoinManager, "OnlyTimelockStablecoinManager");
        });
    });

    describe("Edge Cases", function() {
        it("should handle duplicate additions", async function () {
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 85, 110);

            // Setting again should work (update)
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 80, 115);
            expect(await stablecoinManager.getLTV(await mockToken.getAddress())).to.equal(80n);
        });

        it("should handle removal of non-existent stablecoins", async function () {
            // Disabling a non-stablecoin should work (no-op)
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), false, 85, 110);
            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.false;
        });

        it("should handle invalid threshold values", async function () {
            await expect(
                stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 95, 110)
            ).to.be.revertedWithCustomError(stablecoinManager, "LTVTooHigh");

            await expect(
                stablecoinManager.connect(timelock).setStablecoinParams(await mockToken.getAddress(), true, 85, 105)
            ).to.be.revertedWithCustomError(stablecoinManager, "ThresholdTooLow");
        });
    });
});

describe("StablecoinManager - Coverage Boost", function() {
    let stablecoinManager, timelock, mockToken1, mockToken2;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        // Use owner as timelock for testing
        timelock = owner;

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(owner.address);
        await stablecoinManager.waitForDeployment();

        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken1 = await MockToken.deploy("Mock USDC", "MUSDC");
        await mockToken1.waitForDeployment();

        mockToken2 = await MockToken.deploy("Mock USDT", "MUSDT");
        await mockToken2.waitForDeployment();
    });

    describe("Advanced Functionality", function() {
        it("should initialize with correct parameters", async function () {
            expect(await stablecoinManager.timelock()).to.equal(timelock.address);
        });

        it("should handle multiple stablecoins", async function () {
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken1.getAddress(), true, 85, 110);
            await stablecoinManager.connect(timelock).setStablecoinParams(await mockToken2.getAddress(), true, 80, 115);

            expect(await stablecoinManager.isStablecoin(await mockToken1.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(await mockToken2.getAddress())).to.be.true;
        });

        it("should handle batch operations", async function () {
            const tokens = [await mockToken1.getAddress(), await mockToken2.getAddress()];
            const ltvs = [85, 80];
            const thresholds = [110, 115];

            for (let i = 0; i < tokens.length; i++) {
                await stablecoinManager.connect(timelock).setStablecoinParams(
                    tokens[i],
                    true,
                    ltvs[i],
                    thresholds[i]
                );
            }

            expect(await stablecoinManager.isStablecoin(mockToken1.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockToken2.getAddress())).to.be.true;
        });
    });
});