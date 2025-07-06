const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🚀 Starting simple deployment...");

    try {
        // Compile contracts first
        console.log("📦 Compiling contracts...");
        await hre.run("compile");
        console.log("✅ Contracts compiled successfully");

        // Get the deployer address
        const [deployer] = await ethers.getSigners();
        console.log("👤 Deploying with account:", deployer.address);

        // Deploy StablecoinManager
        console.log("\n📄 Deploying StablecoinManager...");
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const stablecoinManager = await StablecoinManager.deploy(deployer.address);
        await stablecoinManager.waitForDeployment();
        const stablecoinManagerAddress = await stablecoinManager.getAddress();
        console.log("✅ StablecoinManager deployed to:", stablecoinManagerAddress);

        // Deploy LiquidityPoolV3
        console.log("\n📄 Deploying LiquidityPoolV3...");
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
        console.log("✅ LiquidityPoolV3 deployed to:", liquidityPoolV3Address);

        // Deploy LendingManager
        console.log("\n📄 Deploying LendingManager...");
        const LendingManager = await ethers.getContractFactory("LendingManager");
        const lendingManager = await LendingManager.deploy(deployer.address, liquidityPoolV3Address);
        await lendingManager.waitForDeployment();
        const lendingManagerAddress = await lendingManager.getAddress();
        console.log("✅ LendingManager deployed to:", lendingManagerAddress);

        // Update LiquidityPoolV3 with LendingManager address
        console.log("\n🔗 Connecting LiquidityPoolV3 to LendingManager...");
        await liquidityPoolV3.setLendingManager(lendingManagerAddress);
        console.log("✅ LiquidityPoolV3 connected to LendingManager");

        // Deploy GlintToken
        console.log("\n📄 Deploying GlintToken...");
        const GlintToken = await ethers.getContractFactory("GlintToken");
        const initialSupply = ethers.parseUnits("1000000", 18);
        const glintToken = await GlintToken.deploy(initialSupply);
        await glintToken.waitForDeployment();
        const glintTokenAddress = await glintToken.getAddress();
        console.log("✅ GlintToken deployed to:", glintTokenAddress);

        // Deploy MockPriceFeed for GlintToken
        console.log("\n📄 Deploying MockPriceFeed for GlintToken...");
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        const glintFeed = await MockPriceFeed.deploy(
            ethers.parseUnits("1.50", 8),
            8
        );
        await glintFeed.waitForDeployment();
        const glintFeedAddress = await glintFeed.getAddress();
        console.log("✅ MockPriceFeed for GlintToken deployed to:", glintFeedAddress);

        // Set up GlintToken as collateral
        console.log("\n🔧 Setting up GlintToken as collateral...");
        await liquidityPoolV3.setAllowedCollateral(glintTokenAddress, true);
        await liquidityPoolV3.setPriceFeed(glintTokenAddress, glintFeedAddress);
        console.log("✅ GlintToken configured as collateral");

        // Set up CORAL as collateral (using a mock address)
        console.log("\n🔧 Setting up CORAL as collateral...");
        const coralTokenAddress = "0xecc6f14f4b64eedd56111d80f46ce46933dc2d64";
        const coralFeed = await MockPriceFeed.deploy(
            ethers.parseUnits("1.00", 8),
            8
        );
        await coralFeed.waitForDeployment();
        const coralFeedAddress = await coralFeed.getAddress();

        await liquidityPoolV3.setAllowedCollateral(coralTokenAddress, true);
        await liquidityPoolV3.setPriceFeed(coralTokenAddress, coralFeedAddress);
        console.log("✅ CORAL configured as collateral");

        // Copy artifacts to frontend
        console.log("\n📋 Copying artifacts to frontend...");
        try {
            require('./copy-artifacts.js');
            console.log("✅ Artifacts copied successfully");
        } catch (error) {
            console.log("⚠️  Failed to copy artifacts:", error.message);
        }

        // Update App.jsx with new addresses
        console.log("\n📝 Updating frontend addresses...");
        try {
            const { updateAppAddresses } = require('./update-app-addresses.js');
            await updateAppAddresses({
                liquidityPoolV3Address,
                lendingManagerAddress,
                tokens: {
                    GLINT: glintTokenAddress,
                    CORAL: coralTokenAddress,
                    USDC: "0x0000000000000000000000000000000000000000",
                    USDT: "0x0000000000000000000000000000000000000000"
                }
            });
            console.log("✅ Frontend addresses updated");
        } catch (error) {
            console.log("⚠️  Failed to update frontend addresses:", error.message);
        }

        // Deployment summary
        console.log("\n🎉 DEPLOYMENT SUMMARY:");
        console.log("=====================");
        console.log("StablecoinManager:", stablecoinManagerAddress);
        console.log("LiquidityPoolV3:", liquidityPoolV3Address);
        console.log("LendingManager:", lendingManagerAddress);
        console.log("GlintToken:", glintTokenAddress);
        console.log("GlintToken Price Feed:", glintFeedAddress);
        console.log("CORAL Price Feed:", coralFeedAddress);
        console.log("\n✅ All contracts deployed successfully!");

        // Run full mockup simulation
        console.log("\n🎭 Running full mockup simulation...");
        try {
            // Set environment variables for the mockup script
            process.env.LIQUIDITY_POOL_ADDRESS = liquidityPoolV3Address;
            process.env.LENDING_MANAGER_ADDRESS = lendingManagerAddress;
            process.env.GLINT_TOKEN_ADDRESS = glintTokenAddress;

            // Import and run the mockup script
            const { runMockupSimulation } = require('./run-mockup-after-deploy.js');
            await runMockupSimulation({
                liquidityPool: liquidityPoolV3Address,
                lendingManager: lendingManagerAddress,
                glintToken: glintTokenAddress
            });
            console.log("✅ Full mockup simulation completed successfully!");
        } catch (error) {
            console.log("⚠️  Full mockup simulation failed:", error.message);
            console.log("Running basic setup instead...");

            // Fallback to basic setup
            try {
                // Set credit scores for test accounts
                await liquidityPoolV3.setCreditScore("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", 85); // Account #2
                await liquidityPoolV3.setCreditScore("0x90F79bf6EB2c4f870365E785982E1f101E93b906", 75); // Account #3
                console.log("✅ Credit scores set for test accounts");

                // Set liquidation thresholds
                await liquidityPoolV3.setLiquidationThreshold(glintTokenAddress, 130);
                await liquidityPoolV3.setLiquidationThreshold(coralTokenAddress, 130);
                console.log("✅ Liquidation thresholds set");

                console.log("✅ Basic setup completed");
            } catch (basicError) {
                console.log("⚠️  Basic setup also failed:", basicError.message);
            }
        }

        console.log("\n🚀 Your lending platform is ready!");
        console.log("📱 Frontend: http://localhost:5173");
        console.log("🔗 Hardhat Node: http://localhost:8545");
        console.log("\n💡 The platform now has realistic mockup data for testing!");

    } catch (error) {
        console.error("❌ Deployment failed:", error.message);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Unhandled error:", error.message);
        process.exit(1);
    }); 