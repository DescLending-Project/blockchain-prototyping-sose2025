const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("Starting deployment of all contracts...");

    // Get the deployer address first
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // Deploy GlintToken first with initial supply of 1,000,000 tokens
    console.log("\nDeploying GlintToken...");
    const GlintToken = await ethers.getContractFactory("GlintToken");
    const initialSupply = ethers.parseUnits("1000000", 18); // 1 million tokens with 18 decimals
    const glintToken = await GlintToken.deploy(initialSupply);
    await glintToken.waitForDeployment();
    const glintTokenAddress = await glintToken.getAddress();
    console.log("GlintToken deployed to:", glintTokenAddress);

    // Deploy MockPriceFeed for GlintToken with initial price of 1.50 and 8 decimals
    console.log("\nDeploying MockPriceFeed for GlintToken...");
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const glintFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.50", 8),
        8
    );
    await glintFeed.waitForDeployment();
    const glintFeedAddress = await glintFeed.getAddress();
    console.log("MockPriceFeed for GlintToken deployed to:", glintFeedAddress);

    // Deploy MockPriceFeed for CORAL with initial price of 1.00 and 8 decimals
    console.log("\nDeploying MockPriceFeed for CORAL...");
    const coralFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.00", 8),
        8
    );
    await coralFeed.waitForDeployment();
    const coralFeedAddress = await coralFeed.getAddress();
    console.log("MockPriceFeed for CORAL deployed to:", coralFeedAddress);

    // Deploy LiquidityPoolV3 (upgradeable)
    console.log("\nDeploying LiquidityPoolV3...");
    const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
    const liquidityPoolV3 = await upgrades.deployProxy(LiquidityPoolV3, [deployer.address], {
        initializer: "initialize",
    });
    await liquidityPoolV3.waitForDeployment();
    const liquidityPoolV3Address = await liquidityPoolV3.getAddress();
    console.log("LiquidityPoolV3 deployed to:", liquidityPoolV3Address);

    // Set up GlintToken as collateral
    console.log("\nSetting up GlintToken as collateral...");
    const setCollateralTx = await liquidityPoolV3.setAllowedCollateral(glintTokenAddress, true);
    await setCollateralTx.wait();
    console.log("GlintToken set as allowed collateral");

    // Set up CORAL as collateral
    console.log("\nSetting up CORAL as collateral...");
    const coralTokenAddress = "0xAF93888cbD250300470A1618206e036E11470149";
    const setCoralCollateralTx = await liquidityPoolV3.setAllowedCollateral(coralTokenAddress, true);
    await setCoralCollateralTx.wait();
    console.log("CORAL set as allowed collateral");

    // Verify CORAL is allowed as collateral
    const coralIsAllowed = await liquidityPoolV3.isAllowedCollateral(coralTokenAddress);
    if (!coralIsAllowed) {
        throw new Error("Failed to set CORAL as allowed collateral");
    }

    // Verify Glint is allowed as collateral
    const isAllowed = await liquidityPoolV3.isAllowedCollateral(glintTokenAddress);
    if (!isAllowed) {
        throw new Error("Failed to set GlintToken as allowed collateral");
    }

    // Set up price feed for GlintToken
    console.log("\nSetting up price feed for GlintToken...");
    const setPriceFeedTx = await liquidityPoolV3.setPriceFeed(glintTokenAddress, glintFeedAddress);
    await setPriceFeedTx.wait();
    console.log("Price feed set for GlintToken");

    // Set up price feed for CORAL
    console.log("\nSetting up price feed for CORAL...");
    const setCoralPriceFeedTx = await liquidityPoolV3.setPriceFeed(coralTokenAddress, coralFeedAddress);
    await setCoralPriceFeedTx.wait();
    console.log("Price feed set for CORAL");

    // Set liquidation threshold for GlintToken
    console.log("\nSetting liquidation threshold for GlintToken...");
    const setThresholdTx = await liquidityPoolV3.setLiquidationThreshold(glintTokenAddress, 130); // 130%
    await setThresholdTx.wait();
    console.log("Liquidation threshold set for GlintToken");

    // Set liquidation threshold for CORAL
    console.log("\nSetting liquidation threshold for CORAL...");
    const setCoralThresholdTx = await liquidityPoolV3.setLiquidationThreshold(coralTokenAddress, 130); // 130%
    await setCoralThresholdTx.wait();
    console.log("Liquidation threshold set for CORAL");

    console.log("\nDeployment Summary:");
    console.log("-------------------");
    console.log("GlintToken:", glintTokenAddress);
    console.log("MockPriceFeed (Glint):", glintFeedAddress);
    console.log("MockPriceFeed (CORAL):", coralFeedAddress);
    console.log("LiquidityPoolV3:", liquidityPoolV3Address);
    console.log("\nDeployment completed successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });