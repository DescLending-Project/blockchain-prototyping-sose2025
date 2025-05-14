const { ethers, upgrades } = require("hardhat");

// Upgrade the existing proxy to a new implementation of the contract
// This script assumes that the proxy has already been deployed and is at a known address

async function main() {
    const proxyAddress = "0x94B47bc12E37D9dd25dE159BC6Ecc6663cA768ce"; // Replace with proxy address when proxy code is changed and deployed again

    const LiquidityPoolV2 = await ethers.getContractFactory("LiquidityPoolV2"); 

    const upgraded = await upgrades.upgradeProxy(proxyAddress, LiquidityPoolV2);

    console.log("Proxy upgraded. New logic at:", await upgrades.erc1967.getImplementationAddress(proxyAddress));
    console.log("Proxy address (unchanged):", upgraded.target);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
