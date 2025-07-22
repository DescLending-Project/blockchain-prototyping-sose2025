const { ethers, upgrades } = require("hardhat");
const { updateAppAddresses } = require('./update-app-addresses.js');

const networkConfig = {
    localhost: {
        USDC: "0x0000000000000000000000000000000000000000", // Mock address for localhost
        USDT: "0x0000000000000000000000000000000000000000", // Mock address for localhost
        USDC_FEED: "0x0000000000000000000000000000000000000000", // Mock address for localhost
        USDT_FEED: "0x0000000000000000000000000000000000000000", // Mock address for localhost
        // Add ZK verifier configuration
        USE_REAL_VERIFIER: false,
        RISC_ZERO_VERIFIER: null // Will use mock
    },
    sepolia: {
        USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
        USDT: "0x7169d38820dfd117c3fa1f22a697dba58d90ba06",
        USDC_FEED: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
        USDT_FEED: "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
        // Real RISC Zero verifier for Sepolia
        USE_REAL_VERIFIER: true,
        RISC_ZERO_VERIFIER: "0xD0141E899a65C95a556fE2B27e5982A6DE7fDD7A"
    },
    // sonic is deprecated for us
    sonic: {
        USDC: "0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6",
        USDT: "0x6047828dc181963ba44974801ff68e538da5eaf9",
        USDC_FEED: "0x55bCa887199d5520B3Ce285D41e6dC10C08716C9",
        USDT_FEED: "0x76F4C040A792aFB7F6dBadC7e30ca3EEa140D216",
        USE_REAL_VERIFIER: false,
        RISC_ZERO_VERIFIER: null
    }
};

async function deployZKComponents(deployer, config, liquidityPoolV3Address) {
    console.log("\n=== DEPLOYING ZK PROOF SYSTEM ===");
    
    let verifierAddress;
    let simpleRisc0TestAddress;
    let creditSystemAddress;

    try {
        // Step 1: Deploy or use existing RISC Zero verifier
        if (config.USE_REAL_VERIFIER && config.RISC_ZERO_VERIFIER) {
            console.log("🔐 Using Real RISC Zero Verifier:", config.RISC_ZERO_VERIFIER);
            verifierAddress = config.RISC_ZERO_VERIFIER;
        } else {
            console.log("🎭 Deploying Mock RISC Zero Verifier...");
            const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
            const mockVerifier = await MockRiscZeroVerifier.deploy();
            await mockVerifier.waitForDeployment();
            verifierAddress = await mockVerifier.getAddress();
            console.log("✅ Mock verifier deployed:", verifierAddress);
        }

        // Step 2: Deploy SimpleRISC0Test
        console.log("\n📋 Deploying SimpleRISC0Test...");
        const SimpleRISC0Test = await ethers.getContractFactory("SimpleRISC0Test");
        const simpleRisc0Test = await SimpleRISC0Test.deploy(verifierAddress);
        await simpleRisc0Test.waitForDeployment();
        simpleRisc0TestAddress = await simpleRisc0Test.getAddress();
        console.log("✅ SimpleRISC0Test deployed:", simpleRisc0TestAddress);

        // Enable demo mode for mock verifier
        if (!config.USE_REAL_VERIFIER) {
            await simpleRisc0Test.setDemoMode(true);
            console.log("✅ Demo mode enabled for testing");
        }

        // Step 3: Deploy IntegratedCreditSystem
        console.log("\n📋 Deploying IntegratedCreditSystem...");
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        const creditSystem = await IntegratedCreditSystem.deploy(
            simpleRisc0TestAddress,
            liquidityPoolV3Address
        );
        await creditSystem.waitForDeployment();
        creditSystemAddress = await creditSystem.getAddress();
        console.log("✅ IntegratedCreditSystem deployed:", creditSystemAddress);

        console.log("\n✅ ZK Proof System deployed successfully!");
        return {
            verifierAddress,
            simpleRisc0TestAddress,
            creditSystemAddress
        };

    } catch (error) {
        console.error("❌ ZK deployment failed:", error.message);
        // Return null addresses so the rest of deployment can continue
        return {
            verifierAddress: null,
            simpleRisc0TestAddress: null,
            creditSystemAddress: null
        };
    }
}

async function connectZKToLiquidityPool(liquidityPoolV3, creditSystemAddress) {
    if (!creditSystemAddress) {
        console.log("⚠️ Skipping ZK integration - credit system not deployed");
        return false;
    }

    try {
        console.log("\n🔗 Connecting ZK Credit System to LiquidityPool...");
        
        // Connect credit system to liquidity pool
        await liquidityPoolV3.setCreditSystem(creditSystemAddress);
        console.log("✅ Credit system connected to LiquidityPool");

        // Enable ZK proof requirement (optional - you can disable this)
        await liquidityPoolV3.setZKProofRequirement(false); // Start with false for testing
        console.log("✅ ZK proof requirement configured");

        return true;
    } catch (error) {
        console.error("❌ Failed to connect ZK system:", error.message);
        return false;
    }
}

async function main() {
    console.log("Starting deployment of all contracts with ZK integration...");

    // Compile contracts first
    console.log("Compiling contracts...");
    try {
        await hre.run("compile");
        console.log("✅ Contracts compiled successfully");
    } catch (error) {
        console.error("❌ Contract compilation failed:", error.message);
        process.exit(1);
    }

    // Copy artifacts to frontend after compilation
    try {
        console.log("Copying artifacts to frontend...");
        require('./copy-artifacts.js');
        console.log("✅ Artifacts copied successfully");
    } catch (error) {
        console.error("❌ Failed to copy artifacts:", error.message);
        // Don't exit here, continue with deployment
    }

    // Get the deployer address first
    const [deployer] = await ethers.getSigners();
    const chainIdRaw = (await ethers.provider.getNetwork()).chainId;
    const chainId = Number(chainIdRaw);
    console.log("Detected chainId:", chainId, typeof chainId);
    let networkName;
    switch (chainId) {
        case 31337: // Hardhat localhost
            networkName = "localhost";
            break;
        case 11155111:
            networkName = "sepolia";
            break;
        case 57054: // Sonic Testnet
            networkName = "sonic";
            break;
        default:
            throw new Error(`Unsupported chainId: ${chainId}`);
    }

    const config = networkConfig[networkName];
    const usdcAddress = config.USDC;
    const usdtAddress = config.USDT;
    const usdcFeed = config.USDC_FEED;
    const usdtFeed = config.USDT_FEED;

    console.log(`Deploying to network: ${networkName}`);
    console.log("USDC:", usdcAddress);
    console.log("USDT:", usdtAddress);
    console.log("ZK Mode:", config.USE_REAL_VERIFIER ? "Real Verifier" : "Mock Verifier");

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

    // Deploy MockPriceFeed for CORAL with initial price of 1.00 and 8 decimals (before deploying LiquidityPoolV3)
    console.log("\nDeploying MockPriceFeed for CORAL...");
    const coralFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.00", 8),
        8
    );
    await coralFeed.waitForDeployment();
    const coralFeedAddress = await coralFeed.getAddress();
    console.log("MockPriceFeed for CORAL deployed to:", coralFeedAddress);

    // Deploy MockPriceFeed for USDC with initial price of 1.00 and 8 decimals
    console.log("\nDeploying MockPriceFeed for USDC...");
    const usdcMockFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.00", 8),
        8
    );
    await usdcMockFeed.waitForDeployment();
    const usdcMockFeedAddress = await usdcMockFeed.getAddress();
    console.log("MockPriceFeed for USDC deployed to:", usdcMockFeedAddress);

    // Deploy MockPriceFeed for USDT with initial price of 1.00 and 8 decimals
    console.log("\nDeploying MockPriceFeed for USDT...");
    const usdtMockFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.00", 8),
        8
    );
    await usdtMockFeed.waitForDeployment();
    const usdtMockFeedAddress = await usdtMockFeed.getAddress();
    console.log("MockPriceFeed for USDT deployed to:", usdtMockFeedAddress);

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
        ethers.ZeroAddress, // Temporary placeholder for LendingManager
        ethers.ZeroAddress // Temporary placeholder for CreditSystem
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

    // NEW: Deploy ZK Proof System
    const zkComponents = await deployZKComponents(deployer, config, liquidityPoolV3Address);
    
    // Connect ZK system to LiquidityPool
    const zkConnected = await connectZKToLiquidityPool(liquidityPoolV3, zkComponents.creditSystemAddress);

    // Continue with existing deployment...

    // Set up GlintToken as collateral
    console.log("\nSetting up GlintToken as collateral...");
    const setCollateralTx = await liquidityPoolV3.setAllowedCollateral(glintTokenAddress, true);
    await setCollateralTx.wait();
    console.log("GlintToken set as allowed collateral");

    // Set price feed for GLINT after LendingManager is set
    try {
        await liquidityPoolV3.setPriceFeed(glintTokenAddress, glintFeedAddress);
        console.log("GLINT price feed set");
        // Verify
        const pf = await liquidityPoolV3.getPriceFeed(glintTokenAddress);
        console.log("GLINT price feed address in contract:", pf);
        const value = await liquidityPoolV3.getTokenValue(glintTokenAddress);
        console.log("GLINT price feed value:", ethers.formatUnits(value, 18), "USD");
    } catch (e) {
        console.error("Failed to set or verify GLINT price feed:", e);
    }

    // Set up CORAL as collateral
    console.log("\nSetting up CORAL as collateral...");
    const coralTokenAddress = "0xecc6f14f4b64eedd56111d80f46ce46933dc2d64";
    const setCoralCollateralTx = await liquidityPoolV3.setAllowedCollateral(coralTokenAddress, true);
    await setCoralCollateralTx.wait();
    console.log("CORAL set as allowed collateral");

    // Set price feed for CORAL on the deployed LiquidityPoolV3
    try {
        await liquidityPoolV3.setPriceFeed(coralTokenAddress, coralFeedAddress);
        console.log("CORAL price feed set");
    } catch (e) {
        console.error("Failed to set CORAL price feed:", e);
    }

    // Set up USDC as collateral (only if not localhost)
    if (networkName !== "localhost") {
        console.log("\nSetting up USDC as collateral...");
        const setUsdcCollateralTx = await liquidityPoolV3.setAllowedCollateral(usdcAddress, true);
        await setUsdcCollateralTx.wait();
        console.log("USDC set as allowed collateral");

        // Set price feed for USDC based on network config
        try {
            await liquidityPoolV3.setPriceFeed(usdcAddress, usdcMockFeedAddress);
            console.log("USDC price feed set");
        } catch (e) {
            console.error("Failed to set USDC price feed:", e);
        }

        // Set up USDT as collateral
        console.log("\nSetting up USDT as collateral...");
        const setUsdtCollateralTx = await liquidityPoolV3.setAllowedCollateral(usdtAddress, true);
        await setUsdtCollateralTx.wait();
        console.log("USDT set as allowed collateral");

        // Set price feed for USDT based on network config
        try {
            await liquidityPoolV3.setPriceFeed(usdtAddress, usdtMockFeedAddress);
            console.log("USDT price feed set");
        } catch (e) {
            console.error("Failed to set USDT price feed:", e);
        }
    } else {
        console.log("\nSkipping USDC/USDT setup for localhost (using mock addresses)");
    }

    const verifyTokenSetup = async (pool, token) => {
        try {
            const isAllowed = await pool.isAllowedCollateral(token);
            const priceFeed = await pool.getPriceFeed(token);

            if (!isAllowed) throw new Error(token + ' not allowed as collateral');
            if (priceFeed === ethers.ZeroAddress) throw new Error('Price feed not set for ' + token);

            //get the token value to verify the price feed is working
            try {
                const value = await pool.getTokenValue(token);
                console.log(`Price feed verified for ${token}. Current value: ${ethers.formatUnits(value, 18)} USD`);
            } catch (e) {
                throw new Error(`Price feed not working for ${token}: ${e.message}`);
            }
        } catch (error) {
            console.error("Error verifying token setup:", error.message);
        }
    };

    // Set up price feeds for all tokens with retries
    const setupPriceFeed = async (token, feed, retries = 3) => {
        for (let i = 0; i < retries; i++) {
            try {
                await liquidityPoolV3.setPriceFeed(token, feed);
                console.log(`Price feed set for ${token}`);
                // Verify it works
                await verifyTokenSetup(liquidityPoolV3, token);
                return true;
            } catch (e) {
                console.error(`Attempt ${i + 1}/${retries} failed to set price feed for ${token}:`, e.message);
                if (i === retries - 1) {
                    console.error(`Failed to set price feed for ${token} after ${retries} attempts`);
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    };

    // Set up price feeds with the new retry mechanism
    console.log("\nSetting up price feeds...");
    await setupPriceFeed(glintTokenAddress, glintFeedAddress);
    await setupPriceFeed(coralTokenAddress, coralFeedAddress);
    if (networkName !== "localhost") {
        await setupPriceFeed(usdcAddress, usdcMockFeedAddress);
        await setupPriceFeed(usdtAddress, usdtMockFeedAddress);
    }

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

    // Deploy InterestRateModel
    console.log("\nDeploying InterestRateModel...");
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    // Example parameters, adjust as needed
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
    // Use deployer.address and a mock oracle for now
    const OracleMock = await ethers.getContractFactory("OracleMock");
    const oracleMock = await OracleMock.deploy();
    await oracleMock.waitForDeployment();
    const oracleAddress = await oracleMock.getAddress();
    const irm = await InterestRateModel.deploy(
        deployer.address,
        oracleAddress,
        irmParams
    );
    await irm.waitForDeployment();
    const irmAddress = await irm.getAddress();
    console.log("InterestRateModel deployed to:", irmAddress);

    // Deployment summary with ZK components
    console.log("\nDeployment Summary:");
    console.log("===================");
    console.log("🏢 CORE CONTRACTS:");
    console.log("GlintToken:", glintTokenAddress);
    console.log("MockPriceFeed (Glint):", glintFeedAddress);
    console.log("CORAL Token:", coralTokenAddress);
    console.log("MockPriceFeed (CORAL):", coralFeedAddress);
    console.log("USDC:", usdcAddress);
    console.log("USDT:", usdtAddress);
    console.log("StablecoinManager:", stablecoinManagerAddress);
    console.log("LiquidityPoolV3:", liquidityPoolV3Address);
    console.log("LendingManager:", lendingManagerAddress);
    console.log("InterestRateModel:", irmAddress);
    
    console.log("\n🔐 ZK PROOF SYSTEM:");
    console.log("RISC Zero Verifier:", zkComponents.verifierAddress || "Not deployed");
    console.log("SimpleRISC0Test:", zkComponents.simpleRisc0TestAddress || "Not deployed");
    console.log("IntegratedCreditSystem:", zkComponents.creditSystemAddress || "Not deployed");
    console.log("ZK Integration Status:", zkConnected ? "✅ Connected" : "❌ Failed");

    // Update App.jsx with new addresses including ZK components
    console.log("\nUpdating App.jsx addresses...");
    try {
        const updateResult = await updateAppAddresses({
            liquidityPoolV3Address,
            lendingManagerAddress,
            interestRateModelAddress: irmAddress,
            // Add ZK components
            creditSystemAddress: zkComponents.creditSystemAddress,
            simpleRisc0TestAddress: zkComponents.simpleRisc0TestAddress,
            riscZeroVerifierAddress: zkComponents.verifierAddress,
            tokens: {
                GLINT: glintTokenAddress,
                CORAL: coralTokenAddress,
                USDC: usdcAddress,
                USDT: usdtAddress
            }
        });
        console.log("App.jsx update result:", updateResult);
    } catch (error) {
        console.error("Failed to update App.jsx:", error.message);
        // Don't exit, continue with mockup
    }

    // Copy ABI to frontend
    const fs = require('fs');
    const path = require('path');
    const abiSrc = path.join(__dirname, '../artifacts/contracts/InterestRateModel.sol/InterestRateModel.json');
    const abiDest = path.join(__dirname, '../../frontend/src/abis/InterestRateModel.json');
    try {
        fs.copyFileSync(abiSrc, abiDest);
        console.log('InterestRateModel ABI copied to frontend.');
    } catch (e) {
        console.error('Failed to copy InterestRateModel ABI:', e.message);
    }

    // Copy ZK-related ABIs
    try {
        if (zkComponents.creditSystemAddress) {
            const creditSystemAbiSrc = path.join(__dirname, '../artifacts/contracts/IntegratedCreditSystem.sol/IntegratedCreditSystem.json');
            const creditSystemAbiDest = path.join(__dirname, '../../frontend/src/abis/IntegratedCreditSystem.json');
            fs.copyFileSync(creditSystemAbiSrc, creditSystemAbiDest);
            console.log('IntegratedCreditSystem ABI copied to frontend.');
        }
    } catch (e) {
        console.error('Failed to copy ZK ABIs:', e.message);
    }

    console.log("\n✅ All contracts and feeds deployed and configured successfully!");

    if (zkConnected) {
        console.log("\n🎉 ZK PROOF SYSTEM READY!");
        console.log("Risc0 team can submit their proofs using:");
        console.log(`- creditSystem.submitTradFiProof(seal, journal)`);
        console.log(`- creditSystem.submitAccountProof(seal, journal)`);
        console.log(`- creditSystem.submitNestingProof(seal, journal)`);
    }

    // Run mockup platform behavior simulation
    console.log("\n=== RUNNING MOCKUP PLATFORM BEHAVIOR SIMULATION ===");
    try {
        // Set environment variables for the mockup script
        process.env.LIQUIDITY_POOL_ADDRESS = liquidityPoolV3Address;
        process.env.LENDING_MANAGER_ADDRESS = lendingManagerAddress;
        process.env.GLINT_TOKEN_ADDRESS = glintTokenAddress;
        process.env.CREDIT_SYSTEM_ADDRESS = zkComponents.creditSystemAddress;

        // Import and run the mockup script
        const { runMockupSimulation } = require('./run-mockup-after-deploy.js');
        await runMockupSimulation({
            liquidityPool: liquidityPoolV3Address,
            lendingManager: lendingManagerAddress,
            glintToken: glintTokenAddress,
            creditSystem: zkComponents.creditSystemAddress
        });
        console.log("✅ Mockup simulation completed successfully!");
    } catch (error) {
        console.error("⚠️  Mockup simulation failed:", error.message);
        console.log("You can run the mockup manually with: npx hardhat run scripts/run-mockup-after-deploy.js");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error in main function:", error.message);
        process.exit(1);
    });