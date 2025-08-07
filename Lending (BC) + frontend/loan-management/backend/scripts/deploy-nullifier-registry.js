// scripts/deploy-nullifier-registry.js
const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    
    console.log("Deploying NullifierRegistry with account:", deployer.address);
    
    // Deploy NullifierRegistry
    const NullifierRegistry = await hre.ethers.getContractFactory("NullifierRegistry");
    const nullifierRegistry = await NullifierRegistry.deploy();
    await nullifierRegistry.waitForDeployment();
    
    console.log("NullifierRegistry deployed to:", nullifierRegistry.address);
    
    // Initialize with timelock as admin
    const timelockAddress = "0xb38180DBd8090c0f0136E78FB1A93654f6f3f481";
    await nullifierRegistry.initialize(timelockAddress);
    
    // Grant NULLIFIER_CONSUMER_ROLE to LiquidityPool
    const liquidityPoolAddress = "0x4a95320F2B6368B5a5fF0b10562481AeA99d6D39";
    const NULLIFIER_CONSUMER_ROLE = await nullifierRegistry.NULLIFIER_CONSUMER_ROLE();
    await nullifierRegistry.grantRole(NULLIFIER_CONSUMER_ROLE, liquidityPoolAddress);
    
    console.log("Setup complete!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});