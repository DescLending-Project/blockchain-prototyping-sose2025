const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Basic Test", function () {
    it("should deploy a simple contract", async function () {
        const [deployer] = await ethers.getSigners();
        console.log("Deployer address:", deployer.address);
        
        // Try to deploy a simple mock contract
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockToken = await MockERC20.deploy("Test Token", "TEST", 18);
        await mockToken.waitForDeployment();
        
        console.log("MockERC20 deployed to:", await mockToken.getAddress());
        expect(await mockToken.name()).to.equal("Test Token");
    });
});
