require('@nomicfoundation/hardhat-chai-matchers');
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Unit", function () {
    let manager, owner, addr1;
    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        manager = await StablecoinManager.deploy(owner.address);
        await manager.deployed();
        if (!manager.address) throw new Error("StablecoinManager address undefined");
    });
    it("should set stablecoin params successfully", async function () {
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(true);
        expect(await manager.stablecoinLTV(addr1.address)).to.equal(ethers.BigNumber.from(80));
        expect(await manager.stablecoinLiquidationThreshold(addr1.address)).to.equal(ethers.BigNumber.from(120));
    });
    it("should revert if LTV too high", async function () {
        await expect(manager.setStablecoinParams(addr1.address, true, 95, 120)).to.be.reverted;
    });
    it("should revert if threshold too low", async function () {
        await expect(manager.setStablecoinParams(addr1.address, true, 80, 100)).to.be.reverted;
    });
    it("should get LTV for stablecoin and non-stablecoin", async function () {
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect(await manager.getLTV(addr1.address)).to.equal(ethers.BigNumber.from(80));
        // Non-stablecoin (default)
        expect(await manager.getLTV(owner.address)).to.equal(ethers.BigNumber.from(75));
    });
    it("should get liquidation threshold for stablecoin and non-stablecoin", async function () {
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect(await manager.getLiquidationThreshold(addr1.address)).to.equal(ethers.BigNumber.from(120));
        // Non-stablecoin (default)
        expect(await manager.getLiquidationThreshold(owner.address)).to.equal(ethers.BigNumber.from(0));
    });
    it("should return isTokenStablecoin correctly", async function () {
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(false);
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(true);
    });
    it("should return default LTV for non-stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.deployed();
        expect(await manager.getLTV(addr1.address)).to.equal(ethers.BigNumber.from(75)); // DEFAULT_VOLATILE_LTV
    });
    it("should return default liquidation threshold for non-stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.deployed();
        expect(await manager.getLiquidationThreshold(addr1.address)).to.equal(ethers.BigNumber.from(0));
    });
    it("should return default and custom LTV for stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.deployed();
        await manager.setStablecoinParams(addr1.address, true, 0, 110);
        expect(await manager.getLTV(addr1.address)).to.equal(ethers.BigNumber.from(85)); // DEFAULT_STABLECOIN_LTV
        await manager.setStablecoinParams(addr1.address, true, 88, 110);
        expect(await manager.getLTV(addr1.address)).to.equal(ethers.BigNumber.from(88));
    });
    it("should return default and custom liquidation threshold for stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.deployed();
        // Set with threshold = 110 (default)
        await manager.setStablecoinParams(addr1.address, true, 85, 110);
        expect(await manager.getLiquidationThreshold(addr1.address)).to.equal(ethers.BigNumber.from(110)); // DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD
        // Set with custom threshold
        await manager.setStablecoinParams(addr1.address, true, 85, 120);
        expect(await manager.getLiquidationThreshold(addr1.address)).to.equal(ethers.BigNumber.from(120));
    });
    it("should return correct isTokenStablecoin value", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.deployed();
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(false);
        await manager.setStablecoinParams(addr1.address, true, 85, 110);
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(true);
    });
}); 