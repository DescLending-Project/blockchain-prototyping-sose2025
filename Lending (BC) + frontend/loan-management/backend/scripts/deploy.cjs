const { ethers, upgrades } = require("hardhat");

async function main() {
    const LiquidityPoolV1 = await ethers.getContractFactory("LiquidityPoolV1");
    const [deployer] = await ethers.getSigners();

    // Deploy the proxy (this will also deploy the implementation behind the scenes)
    const proxy = await upgrades.deployProxy(LiquidityPoolV1, [deployer.address], {
        initializer: "initialize",
    });

    await proxy.waitForDeployment();

    console.log("LiquidityPool Proxy deployed to:", await proxy.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
