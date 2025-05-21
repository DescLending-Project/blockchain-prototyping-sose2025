const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying with account: ${deployer.address}`);

    const initialCoralPrice = ethers.utils.parseUnits("0.25", 8); // 0.25 USD
    const initialGlintPrice = ethers.utils.parseUnits("1.50", 8); // 1.50 USD

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");

    const coralFeed = await MockPriceFeed.deploy(initialCoralPrice);
    await coralFeed.deployed();
    console.log(`Mock CORAL price feed deployed at: ${coralFeed.address}`);

    const glintFeed = await MockPriceFeed.deploy(initialGlintPrice);
    await glintFeed.deployed();
    console.log(`Mock GLINT price feed deployed at: ${glintFeed.address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
