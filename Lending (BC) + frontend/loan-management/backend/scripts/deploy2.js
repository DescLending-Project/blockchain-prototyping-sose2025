const { ethers, upgrades } = require("hardhat");

// deploy new version of the contract, LiquidityPoolV3, to the same proxy address

async function main() {
  const LiquidityPoolV2 = await ethers.getContractFactory("LiquidityPoolV3");
  const [deployer] = await ethers.getSigners();

  const proxy = await upgrades.deployProxy(
    LiquidityPoolV2,
    [deployer.address],
    { initializer: "initialize" }
  );

  await proxy.waitForDeployment();
  console.log("Proxy deployed to:", await proxy.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});