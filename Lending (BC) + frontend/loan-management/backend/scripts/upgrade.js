const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("Starting contract upgrade...");

    // Get the deployer address
    const [deployer] = await ethers.getSigners();
    console.log("Upgrading contracts with account:", deployer.address);

    // The address of your existing proxy contract
    const proxyAddress = "0xf30De718933577972094a37BE4373F7dda83E9e7";

    // Deploy the new implementation
    const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
    console.log("Upgrading LiquidityPoolV3...");
    
    const upgraded = await upgrades.upgradeProxy(proxyAddress, LiquidityPoolV3);
    await upgraded.waitForDeployment();
    
    console.log("LiquidityPoolV3 upgraded successfully!");
    console.log("Proxy address:", proxyAddress);
    console.log("New implementation deployed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Upgrade failed:", error);
        process.exit(1);
    }); 