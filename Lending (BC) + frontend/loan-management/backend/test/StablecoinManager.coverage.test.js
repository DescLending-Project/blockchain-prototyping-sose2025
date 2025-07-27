const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Comprehensive Coverage", function () {
    let stablecoinManager, timelock, mockToken;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy mock timelock
        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        timelock = await MockTimelock.deploy();
        await timelock.deployed();

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(timelock.address);
        await stablecoinManager.deployed();

        // Deploy mock token
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock USDC", "MUSDC");
        await mockToken.deployed();
    });

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            expect(await stablecoinManager.timelock()).to.equal(timelock.address);
        });

        it("should have empty stablecoin list initially", async function () {
            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.false;
        });
    });

    describe("Stablecoin Management", function () {
        it("should allow timelock to add stablecoins", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(
                mockToken.address,
                150, // liquidationThreshold
                120  // borrowThreshold
            );

            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.true;
            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(150);
            expect(await stablecoinManager.borrowThresholds(mockToken.address)).to.equal(120);
        });

        it("should allow timelock to remove stablecoins", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 120);
            await stablecoinManager.connect(timelock).removeStablecoin(mockToken.address);

            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.false;
        });

        it("should allow threshold updates", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 120);

            await stablecoinManager.connect(timelock).updateLiquidationThreshold(mockToken.address, 160);
            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(160);

            await stablecoinManager.connect(timelock).updateBorrowThreshold(mockToken.address, 130);
            expect(await stablecoinManager.borrowThresholds(mockToken.address)).to.equal(130);
        });

        it("should reject unauthorized operations", async function () {
            await expect(
                stablecoinManager.connect(user1).addStablecoin(mockToken.address, 150, 120)
            ).to.be.revertedWith("Only timelock");

            await expect(
                stablecoinManager.connect(user1).removeStablecoin(mockToken.address)
            ).to.be.revertedWith("Only timelock");
        });
    });

    describe("Edge Cases", function () {
        it("should handle duplicate additions", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 120);

            await expect(
                stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 160, 130)
            ).to.be.revertedWith("Already a stablecoin");
        });

        it("should handle removal of non-existent stablecoins", async function () {
            await expect(
                stablecoinManager.connect(timelock).removeStablecoin(mockToken.address)
            ).to.be.revertedWith("Not a stablecoin");
        });

        it("should handle invalid threshold values", async function () {
            await expect(
                stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 50, 120)
            ).to.be.revertedWith("Invalid liquidation threshold");

            await expect(
                stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 50)
            ).to.be.revertedWith("Invalid borrow threshold");
        });
    });
});

describe("StablecoinManager - Coverage Boost", function () {
    let stablecoinManager, timelock, mockToken1, mockToken2;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        // Deploy mock timelock
        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        timelock = await MockTimelock.deploy();
        await timelock.deployed();

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(timelock.address);
        await stablecoinManager.deployed();

        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken1 = await MockToken.deploy("Mock USDC", "MUSDC");
        await mockToken1.deployed();

        mockToken2 = await MockToken.deploy("Mock USDT", "MUSDT");
        await mockToken2.deployed();
    });

    describe("Advanced Functionality", function () {
        it("should initialize with correct parameters", async function () {
            expect(await stablecoinManager.timelock()).to.equal(timelock.address);
        });

        it("should handle multiple stablecoins", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(mockToken1.address, 150, 120);
            await stablecoinManager.connect(timelock).addStablecoin(mockToken2.address, 140, 110);

            expect(await stablecoinManager.isStablecoin(mockToken1.address)).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockToken2.address)).to.be.true;
        });

        it("should handle batch operations", async function () {
            const tokens = [mockToken1.address, mockToken2.address];
            const liquidationThresholds = [150, 140];
            const borrowThresholds = [120, 110];

            for (let i = 0; i < tokens.length; i++) {
                await stablecoinManager.connect(timelock).addStablecoin(
                    tokens[i],
                    liquidationThresholds[i],
                    borrowThresholds[i]
                );
            }

            expect(await stablecoinManager.isStablecoin(mockToken1.address)).to.be.true;
            expect(await stablecoinManager.isStablecoin(mockToken2.address)).to.be.true;
        });
    });
});
