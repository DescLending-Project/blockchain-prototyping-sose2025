const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Coverage Boost", function () {
    let stablecoinManager;
    let mockTimelock;
    let owner, user1, user2;
    let mockToken;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy mock timelock
        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        mockTimelock = await MockTimelock.deploy();
        await mockTimelock.deployed();

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(mockTimelock.address);
        await stablecoinManager.deployed();

        // Deploy mock token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Mock Token", "MOCK", 18);
        await mockToken.deployed();
    });

    describe("Token Management", function () {
        it("should add supported tokens", async function () {
            await stablecoinManager.addSupportedToken(mockToken.address);
            expect(await stablecoinManager.supportedTokens(mockToken.address)).to.be.true;
        });

        it("should remove supported tokens", async function () {
            await stablecoinManager.addSupportedToken(mockToken.address);
            await stablecoinManager.removeSupportedToken(mockToken.address);
            expect(await stablecoinManager.supportedTokens(mockToken.address)).to.be.false;
        });

        it("should reject adding zero address", async function () {
            await expect(
                stablecoinManager.addSupportedToken(ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid token address");
        });

        it("should reject duplicate token addition", async function () {
            await stablecoinManager.addSupportedToken(mockToken.address);
            await expect(
                stablecoinManager.addSupportedToken(mockToken.address)
            ).to.be.revertedWith("Token already supported");
        });
    });

    describe("Access Control", function () {
        it("should only allow timelock to add tokens", async function () {
            await expect(
                stablecoinManager.connect(user1).addSupportedToken(mockToken.address)
            ).to.be.revertedWith("Only timelock");
        });

        it("should only allow timelock to remove tokens", async function () {
            await stablecoinManager.addSupportedToken(mockToken.address);
            await expect(
                stablecoinManager.connect(user1).removeSupportedToken(mockToken.address)
            ).to.be.revertedWith("Only timelock");
        });
    });

    describe("Token Validation", function () {
        it("should validate supported tokens", async function () {
            await stablecoinManager.addSupportedToken(mockToken.address);
            expect(await stablecoinManager.isTokenSupported(mockToken.address)).to.be.true;
            expect(await stablecoinManager.isTokenSupported(user1.address)).to.be.false;
        });

        it("should handle multiple tokens", async function () {
            const MockERC20_2 = await ethers.getContractFactory("MockERC20");
            const mockToken2 = await MockERC20_2.deploy("Mock Token 2", "MOCK2", 18);
            await mockToken2.deployed();

            await stablecoinManager.addSupportedToken(mockToken.address);
            await stablecoinManager.addSupportedToken(mockToken2.address);

            expect(await stablecoinManager.isTokenSupported(mockToken.address)).to.be.true;
            expect(await stablecoinManager.isTokenSupported(mockToken2.address)).to.be.true;
        });
    });

    describe("Emergency Functions", function () {
        it("should handle emergency token removal", async function () {
            await stablecoinManager.addSupportedToken(mockToken.address);
            await stablecoinManager.emergencyRemoveToken(mockToken.address);
            expect(await stablecoinManager.supportedTokens(mockToken.address)).to.be.false;
        });

        it("should pause and unpause", async function () {
            await stablecoinManager.pause();
            expect(await stablecoinManager.paused()).to.be.true;

            await stablecoinManager.unpause();
            expect(await stablecoinManager.paused()).to.be.false;
        });
    });
});
