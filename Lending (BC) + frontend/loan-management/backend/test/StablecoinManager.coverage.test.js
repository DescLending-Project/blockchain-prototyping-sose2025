const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Comprehensive Coverage", function() {
    let stablecoinManager, timelock, mockToken;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy mock timelock
        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        timelock = await MockTimelock.deploy();
        await timelock.waitForDeployment();

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(timelock.getAddress());
        await stablecoinManager.waitForDeployment();

        // Deploy mock token
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock USDC", "MUSDC");
        await mockToken.waitForDeployment();
    });

    describe("Initialization", function() {
        it("should initialize with correct parameters", async function () {
            expect(await stablecoinManager.timelock()).to.equal(timelock.getAddress());
        });

        it("should have empty stablecoin list initially", async function () {
            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.false;
        });
    });

    describe("Stablecoin Management", function() {
        it("should allow timelock to add stablecoins", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(
                await mockToken.getAddress(),
                150, // liquidationThreshold
                120  // borrowThreshold
            );

            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.true;
            expect(await stablecoinManager.liquidationThresholds(await mockToken.getAddress())).to.equal(150n);
            expect(await stablecoinManager.borrowThresholds(await mockToken.getAddress())).to.equal(120n);
        });

        it("should allow timelock to remove stablecoins", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(await mockToken.getAddress(), 150, 120);
            await stablecoinManager.connect(timelock).removeStablecoin(await mockToken.getAddress());

            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.false;
        });

        it("should allow threshold updates", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(await mockToken.getAddress(), 150, 120);

            await stablecoinManager.connect(timelock).updateLiquidationThreshold(await mockToken.getAddress(), 160);
            expect(await stablecoinManager.liquidationThresholds(await mockToken.getAddress())).to.equal(160n);

            await stablecoinManager.connect(timelock).updateBorrowThreshold(await mockToken.getAddress(), 130);
            expect(await stablecoinManager.borrowThresholds(await mockToken.getAddress())).to.equal(130n);
        });

        it("should reject unauthorized operations", async function () {
            await expect(
                stablecoinManager.connect(user1).addStablecoin(await mockToken.getAddress(), 150, 120)
            ).to.be.revertedWithCustomError("Only timelock");

            await expect(
                stablecoinManager.connect(user1).removeStablecoin(await mockToken.getAddress())
            ).to.be.revertedWithCustomError("Only timelock");
        });
    });

    describe("Edge Cases", function() {
        it("should handle duplicate additions", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(await mockToken.getAddress(), 150, 120);

            await expect(
                stablecoinManager.connect(timelock).addStablecoin(await mockToken.getAddress(), 160, 130)
            ).to.be.revertedWithCustomError("Already a stablecoin");
        });

        it("should handle removal of non-existent stablecoins", async function () {
            await expect(
                stablecoinManager.connect(timelock).removeStablecoin(await mockToken.getAddress())
            ).to.be.revertedWithCustomError("Not a stablecoin");
        });

        it("should handle invalid threshold values", async function () {
            await expect(
                stablecoinManager.connect(timelock).addStablecoin(await mockToken.getAddress(), 50, 120)
            ).to.be.revertedWithCustomError("Invalid liquidation threshold");

            await expect(
                stablecoinManager.connect(timelock).addStablecoin(await mockToken.getAddress(), 150, 50)
            ).to.be.revertedWithCustomError("Invalid borrow threshold");
        });
    });
});

describe("StablecoinManager - Coverage Boost", function() {
    let stablecoinManager, timelock, mockToken1, mockToken2;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        // Deploy mock timelock
        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        timelock = await MockTimelock.deploy();
        await timelock.waitForDeployment();

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(timelock.getAddress());
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
            expect(await stablecoinManager.timelock()).to.equal(timelock.getAddress());
        });

        it("should handle multiple stablecoins", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(mockToken1.getAddress(), 150, 120);
            await stablecoinManager.connect(timelock).addStablecoin(mockToken2.getAddress(), 140, 110);

            expect(await stablecoinManager.isStablecoin(mockToken1.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockToken2.getAddress())).to.be.true;
        });

        it("should handle batch operations", async function () {
            const tokens = [mockToken1.getAddress(), mockToken2.getAddress()];
            const liquidationThresholds = [150, 140];
            const borrowThresholds = [120, 110];

            for (let i = 0; i < tokens.length; i++) {
                await stablecoinManager.connect(timelock).addStablecoin(
                    tokens[i],
                    liquidationThresholds[i],
                    borrowThresholds[i]
                );
            }

            expect(await stablecoinManager.isStablecoin(mockToken1.getAddress())).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockToken2.getAddress())).to.be.true;
        });
    });
});