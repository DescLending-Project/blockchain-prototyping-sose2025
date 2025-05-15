const { ethers } = require("hardhat");

async function main() {
  const GlintToken = await ethers.getContractFactory("GlintToken");
  const glint = await GlintToken.deploy(ethers.parseEther("1000000")); // 1 million GLINT

  await glint.waitForDeployment();
  console.log("GLINT token deployed to:", glint.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
