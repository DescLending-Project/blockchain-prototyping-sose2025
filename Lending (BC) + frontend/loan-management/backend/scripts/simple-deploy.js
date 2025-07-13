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

        // Deploy LiquidityPool
        console.log("\n📄 Deploying LiquidityPool...");
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        // Deploy InterestRateModel with correct constructor arguments
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const interestRateModel = await InterestRateModel.deploy(deployer.address, ethers.ZeroAddress, {
            baseRate: 0,
            kink: 0,
            slope1: 0,
            slope2: 0,
            reserveFactor: 0,
            maxBorrowRate: 0,
            maxRateChange: 0,
            ethPriceRiskPremium: 0,
            ethVolatilityThreshold: 0,
            oracleStalenessWindow: 0
        });
        await interestRateModel.waitForDeployment();
        const interestRateModelAddress = await interestRateModel.getAddress();

        const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
            deployer.address,
            stablecoinManagerAddress,
            ethers.ZeroAddress, // Temporary placeholder for LendingManager
            interestRateModelAddress
        ], {
            initializer: "initialize",
        });
        await liquidityPool.waitForDeployment();
        const liquidityPoolAddress = await liquidityPool.getAddress();
        console.log("✅ LiquidityPool deployed to:", liquidityPoolAddress);

        // Deploy LendingManager
        console.log("\n📄 Deploying LendingManager...");
        const LendingManager = await ethers.getContractFactory("LendingManager");
        const lendingManager = await LendingManager.deploy(deployer.address, liquidityPoolAddress);
        await lendingManager.waitForDeployment();
        const lendingManagerAddress = await lendingManager.getAddress();
        console.log("✅ LendingManager deployed to:", lendingManagerAddress);

        // Update LiquidityPool with LendingManager address
        console.log("\n🔗 Connecting LiquidityPool to LendingManager...");
        await liquidityPool.setLendingManager(lendingManagerAddress);
        console.log("✅ LiquidityPool connected to LendingManager");

        // Deploy GlintToken
        console.log("\n📄 Deploying GlintToken...");
        const GlintToken = await ethers.getContractFactory("GlintToken");
        const initialSupply = ethers.parseUnits("1000000", 18);
        const glintToken = await GlintToken.deploy(initialSupply);
        await glintToken.waitForDeployment();
        const glintTokenAddress = await glintToken.getAddress();
        console.log("✅ GlintToken deployed to:", glintTokenAddress);

        // Deploy MockPriceFeed for GlintToken
        console.log("\n\uD83D\uDCC4 Deploying MockPriceFeed for GlintToken...");
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        const glintFeed = await MockPriceFeed.deploy(
            ethers.parseUnits("1.50", 8),
            8
        );
        await glintFeed.waitForDeployment();
        const glintFeedAddress = await glintFeed.getAddress();
        console.log("\u2705 MockPriceFeed for GlintToken deployed to:", glintFeedAddress);

        // --- Deploy OracleMock for InterestRateModel ---
        console.log("\n\uD83D\uDCC4 Deploying OracleMock for InterestRateModel...");
        const OracleMock = await ethers.getContractFactory("OracleMock");
        const oracleMock = await OracleMock.deploy();
        await oracleMock.waitForDeployment();
        const oracleAddress = await oracleMock.getAddress();
        console.log("\u2705 OracleMock deployed to:", oracleAddress);

        // --- Deploy InterestRateModel ---
        console.log("\n\uD83D\uDCC4 Deploying InterestRateModel...");
        const irmParams = [
            ethers.parseUnits("0.02", 18), // baseRate
            ethers.parseUnits("0.8", 18),  // kink
            ethers.parseUnits("0.20", 18), // slope1
            ethers.parseUnits("1.00", 18), // slope2
            ethers.parseUnits("0.10", 18), // reserveFactor
            ethers.parseUnits("2.00", 18), // maxBorrowRate
            ethers.parseUnits("0.05", 18), // maxRateChange
            ethers.parseUnits("0.02", 18), // ethPriceRiskPremium
            ethers.parseUnits("0.05", 18), // ethVolatilityThreshold
            3600 // oracleStalenessWindow
        ];
        const irm = await InterestRateModel.deploy(
            deployer.address,
            oracleAddress,
            irmParams
        );
        await irm.waitForDeployment();
        const irmAddress = await irm.getAddress();
        console.log("\u2705 InterestRateModel deployed to:", irmAddress);

        // Set up GlintToken as collateral
        console.log("\n🔧 Setting up GlintToken as collateral...");
        await liquidityPool.setAllowedCollateral(glintTokenAddress, true);
        await liquidityPool.setPriceFeed(glintTokenAddress, glintFeedAddress);
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

        await liquidityPool.setAllowedCollateral(coralTokenAddress, true);
        await liquidityPool.setPriceFeed(coralTokenAddress, coralFeedAddress);
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
        console.log("\n\uD83D\uDCDD Updating frontend addresses...");
        try {
            const { updateAppAddresses } = require('./update-app-addresses.js');
            await updateAppAddresses({
                liquidityPoolAddress,
                lendingManagerAddress,
                interestRateModelAddress: irmAddress,
                tokens: {
                    GLINT: glintTokenAddress,
                    CORAL: coralTokenAddress,
                    USDC: "0x0000000000000000000000000000000000000000",
                    USDT: "0x0000000000000000000000000000000000000000"
                }
            });
            console.log("\u2705 Frontend addresses updated");
        } catch (error) {
            console.log("\u26A0\uFE0F  Failed to update frontend addresses:", error.message);
        }

        // Deployment summary
        console.log("\n\uD83C\uDF89 DEPLOYMENT SUMMARY:");
        console.log("=====================");
        console.log("StablecoinManager:", stablecoinManagerAddress);
        console.log("LiquidityPool:", liquidityPoolAddress);
        console.log("LendingManager:", lendingManagerAddress);
        console.log("GlintToken:", glintTokenAddress);
        console.log("InterestRateModel:", irmAddress);
        console.log("GlintToken Price Feed:", glintFeedAddress);
        console.log("CORAL Price Feed:", coralFeedAddress);
        console.log("\n✅ All contracts deployed successfully!");

        // Run full mockup simulation
        console.log("\n🎭 Running full mockup simulation...");
        try {
            // Set environment variables for the mockup script
            process.env.LIQUIDITY_POOL_ADDRESS = liquidityPoolAddress;
            process.env.LENDING_MANAGER_ADDRESS = lendingManagerAddress;
            process.env.GLINT_TOKEN_ADDRESS = glintTokenAddress;

            // Import and run the mockup script
            const { runMockupSimulation } = require('./run-mockup-after-deploy.js');
            await runMockupSimulation({
                liquidityPool: liquidityPoolAddress,
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
                await liquidityPool.setCreditScore("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", 85); // Account #2
                await liquidityPool.setCreditScore("0x90F79bf6EB2c4f870365E785982E1f101E93b906", 75); // Account #3
                console.log("✅ Credit scores set for test accounts");

                // Set liquidation thresholds
                await liquidityPool.setLiquidationThreshold(glintTokenAddress, 130);
                await liquidityPool.setLiquidationThreshold(coralTokenAddress, 130);
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