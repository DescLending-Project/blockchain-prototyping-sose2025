const { ethers, upgrades } = require("hardhat");
const { updateAppAddresses } = require('./update-app-addresses.js');

async function main() {
    console.log("Starting deployment of all contracts...");

    // Copy artifacts to frontend first
    console.log("\nCopying contract artifacts to frontend...");
    try {
        require('./copy-artifacts.js');
        console.log("Artifacts copied successfully");
    } catch (error) {
        console.error("Failed to copy artifacts:", error.message);
        process.exit(1);
    }

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

    // Deploy StablecoinManager first
    console.log("\nDeploying StablecoinManager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(deployer.address);
    await stablecoinManager.waitForDeployment();
    const stablecoinManagerAddress = await stablecoinManager.getAddress();
    console.log("StablecoinManager deployed to:", stablecoinManagerAddress);

    // Deploy LiquidityPoolV3 first (without LendingManager for now)
    console.log("\nDeploying LiquidityPoolV3...");
    const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
    const liquidityPoolV3 = await upgrades.deployProxy(LiquidityPoolV3, [
        deployer.address,
        stablecoinManagerAddress,
        ethers.ZeroAddress // Temporary placeholder for LendingManager
    ], {
        initializer: "initialize",
    });
    await liquidityPoolV3.waitForDeployment();
    const liquidityPoolV3Address = await liquidityPoolV3.getAddress();
    console.log("LiquidityPoolV3 deployed to:", liquidityPoolV3Address);

    // Deploy LendingManager with LiquidityPoolV3 address
    console.log("\nDeploying LendingManager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(deployer.address, liquidityPoolV3Address);
    await lendingManager.waitForDeployment();
    const lendingManagerAddress = await lendingManager.getAddress();
    console.log("LendingManager deployed to:", lendingManagerAddress);

    // Update LiquidityPoolV3 with the correct LendingManager address
    console.log("\nUpdating LiquidityPoolV3 with LendingManager address...");
    await liquidityPoolV3.setLendingManager(lendingManagerAddress);
    console.log("LiquidityPoolV3 updated with LendingManager address");

    // Set up GlintToken as collateral
    console.log("\nSetting up GlintToken as collateral...");
    const setCollateralTx = await liquidityPoolV3.setAllowedCollateral(glintTokenAddress, true);
    await setCollateralTx.wait();
    console.log("GlintToken set as allowed collateral");

    // Set up CORAL as collateral
    console.log("\nSetting up CORAL as collateral...");
    const coralTokenAddress = "0xecc6f14f4b64eedd56111d80f46ce46933dc2d64";
    const setCoralCollateralTx = await liquidityPoolV3.setAllowedCollateral(coralTokenAddress, true);
    await setCoralCollateralTx.wait();
    console.log("CORAL set as allowed collateral");

    // Set up USDC as collateral
    console.log("\nSetting up USDC as collateral...");
    const usdcAddress = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8"; // Sepolia USDC
    const setUsdcCollateralTx = await liquidityPoolV3.setAllowedCollateral(usdcAddress, true);
    await setUsdcCollateralTx.wait();
    console.log("USDC set as allowed collateral");

    // Set up USDT as collateral
    console.log("\nSetting up USDT as collateral...");
    const usdtAddress = "0x7169d38820dfd117c3fa1f22a697dba58d90ba06"; // Sepolia USDT
    const setUsdtCollateralTx = await liquidityPoolV3.setAllowedCollateral(usdtAddress, true);
    await setUsdtCollateralTx.wait();
    console.log("USDT set as allowed collateral");

    // Set up stablecoin parameters
    console.log("\nSetting stablecoin parameters...");
    await stablecoinManager.setStablecoinParams(
        usdcAddress,
        true,
        85, // 85% LTV
        110 // 110% liquidation threshold
    );
    await stablecoinManager.setStablecoinParams(
        usdtAddress,
        true,
        85, // 85% LTV
        110 // 110% liquidation threshold
    );

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

    // Verify USDC is allowed as collateral
    const usdcIsAllowed = await liquidityPoolV3.isAllowedCollateral(usdcAddress);
    if (!usdcIsAllowed) {
        throw new Error("Failed to set USDC as allowed collateral");
    }

    // Verify USDT is allowed as collateral
    const usdtIsAllowed = await liquidityPoolV3.isAllowedCollateral(usdtAddress);
    if (!usdtIsAllowed) {
        throw new Error("Failed to set USDT as allowed collateral");
    }

    // Set up price feeds
    console.log("\nSetting up price feeds...");
    await liquidityPoolV3.setPriceFeed(
        glintTokenAddress,
        glintFeedAddress
    );
    await liquidityPoolV3.setPriceFeed(
        coralTokenAddress,
        coralFeedAddress
    );
    await liquidityPoolV3.setPriceFeed(
        usdcAddress,
        "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4" // USDC/ETH feed
    );
    await liquidityPoolV3.setPriceFeed(
        usdtAddress,
        "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46" // USDT/ETH feed
    );

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

    // Add Sonic network stablecoin addresses as comments for reference
    console.log("\nSonic Network Stablecoin Addresses:");
    console.log("USDT: 0x6047828dc181963ba44974801ff68e538da5eaf9");
    console.log("USDC: 0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6");

    console.log("\nDeployment Summary:");
    console.log("-------------------");
    console.log("GlintToken:", glintTokenAddress);
    console.log("MockPriceFeed (Glint):", glintFeedAddress);
    console.log("MockPriceFeed (CORAL):", coralFeedAddress);
    console.log("StablecoinManager:", stablecoinManagerAddress);
    console.log("LiquidityPoolV3:", liquidityPoolV3Address);
    console.log("LendingManager:", lendingManagerAddress);
    console.log("\nDeployment completed successfully!");

    // Update App.jsx with new contract addresses
    console.log("\nUpdating App.jsx with new contract addresses...");
    const deploymentData = {
        liquidityPoolV3Address: liquidityPoolV3Address,
        lendingManagerAddress: lendingManagerAddress,
        glintTokenAddress: glintTokenAddress,
        usdcTokenAddress: usdcAddress, // This might be a mainnet address depending on network
        usdtTokenAddress: usdtAddress  // This might be a mainnet address depending on network
    };

    // Get the current network name from hardhat runtime environment
    const networkName = process.env.HARDHAT_NETWORK || 'sepolia';
    console.log(`Detected network: ${networkName}`);

    const updateSuccess = updateAppAddresses(deploymentData, networkName);
    if (updateSuccess) {
        console.log("App.jsx updated successfully with new addresses");
    } else {
        console.log("Failed to update App.jsx - please update addresses manually");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });