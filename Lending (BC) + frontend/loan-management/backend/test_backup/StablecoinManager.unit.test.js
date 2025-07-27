const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinManager - Unit", function () {
    let manager, owner, addr1;
    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        manager = await StablecoinManager.deploy(owner.address);
        await manager.waitForDeployment();
        if (!manager.address) throw new Error("StablecoinManager address undefined");
    });
    it("should set stablecoin params successfully", async function () {
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(true);
        expect((await manager.stablecoinLTV(addr1.address)).eq(ethers.toBigInt()	.from(80))).to.be.true;
        expect((await manager.stablecoinLiquidationThreshold(addr1.address)).eq(ethers.toBigInt()	.from(120))).to.be.true;
    });
    it("should revert if LTV too high", async function () {
        let reverted = false;
        try {
            await manager.setStablecoinParams(addr1.address, true, 95, 120);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/revert/i);
        }
        expect(reverted).to.be.true;
    });
    it("should revert if threshold too low", async function () {
        let reverted = false;
        try {
            await manager.setStablecoinParams(addr1.address, true, 80, 100);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/revert/i);
        }
        expect(reverted).to.be.true;
    });
    it("should get LTV for stablecoin and non-stablecoin", async function () {
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect((await manager.getLTV(addr1.address)).eq(ethers.toBigInt()	.from(80))).to.be.true;
        // Non-stablecoin (default)
        expect((await manager.getLTV(owner.address)).eq(ethers.toBigInt()	.from(75))).to.be.true;
    });
    it("should get liquidation threshold for stablecoin and non-stablecoin", async function () {
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect((await manager.getLiquidationThreshold(addr1.address)).eq(ethers.toBigInt()	.from(120))).to.be.true;
        // Non-stablecoin (default)
        expect((await manager.getLiquidationThreshold(owner.address)).eq(ethers.toBigInt()	.from(0))).to.be.true;
    });
    it("should return isTokenStablecoin correctly", async function () {
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(false);
        await manager.setStablecoinParams(addr1.address, true, 80, 120);
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(true);
    });
    it("should return default LTV for non-stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.waitForDeployment();
        expect((await manager.getLTV(addr1.address)).eq(ethers.toBigInt()	.from(75))).to.be.true; // DEFAULT_VOLATILE_LTV
    });
    it("should return default liquidation threshold for non-stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.waitForDeployment();
        expect((await manager.getLiquidationThreshold(addr1.address)).eq(ethers.toBigInt()	.from(0))).to.be.true;
    });
    it("should return default and custom LTV for stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.waitForDeployment();
        // Remove the line that sets LTV to zero, as this now reverts
        // await manager.setStablecoinParams(addr1.address, true, 0, 110);
        // Only test setting a custom LTV value
        await manager.setStablecoinParams(addr1.address, true, 88, 110);
        expect((await manager.getLTV(addr1.address)).eq(ethers.toBigInt()	.from(88))).to.be.true;
    });
    it("should return default and custom liquidation threshold for stablecoin", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.waitForDeployment();
        // Set with threshold = 110 (default)
        await manager.setStablecoinParams(addr1.address, true, 85, 110);
        expect((await manager.getLiquidationThreshold(addr1.address)).eq(ethers.toBigInt()	.from(110))).to.be.true; // DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD
        // Set with custom threshold
        await manager.setStablecoinParams(addr1.address, true, 85, 120);
        expect((await manager.getLiquidationThreshold(addr1.address)).eq(ethers.toBigInt()	.from(120))).to.be.true;
    });
    it("should return correct isTokenStablecoin value", async function () {
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const manager = await StablecoinManager.deploy(owner.address);
        await manager.waitForDeployment();
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(false);
        await manager.setStablecoinParams(addr1.address, true, 85, 110);
        expect(await manager.isTokenStablecoin(addr1.address)).to.equal(true);
    });
});

describe("StablecoinManager - Coverage Expansion", function () {
    let manager, owner, addr1;

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        manager = await StablecoinManager.deploy(owner.address);
        await manager.waitForDeployment();
    });

    it("should revert if threshold is zero for stablecoin", async function () {
        let reverted = false;
        try {
            await manager.setStablecoinParams(addr1.address, true, 80, 0);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/threshold|revert|VM Exception/i);
        }
        expect(reverted).to.be.true;
    });
}); 