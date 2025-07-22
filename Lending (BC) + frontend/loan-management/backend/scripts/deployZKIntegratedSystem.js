const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Starting ZK-Integrated System Deployment...\n");

    const [deployer] = await ethers.getSigners();
    console.log("📋 Deployer:", deployer.address);
    console.log("💰 Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Step 1: Deploy RISC Zero Verifier Router
    console.log("1️⃣ Deploying RISC Zero Verifier Router...");
    const RiscZeroVerifierRouter = await ethers.getContractFactory("RiscZeroVerifierRouter");
    const verifierRouter = await RiscZeroVerifierRouter.deploy(deployer.address);
    await verifierRouter.waitForDeployment();
    const routerAddress = await verifierRouter.getAddress();
    console.log("✅ RiscZeroVerifierRouter deployed to:", routerAddress);

    /*
    // Step 2: Deploy Mock RISC Zero Verifier (for testing)
    console.log("\n2️⃣ Deploying Mock RISC Zero Verifier...");
    const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
    const mockVerifier = await MockRiscZeroVerifier.deploy(routerAddress);
    await mockVerifier.waitForDeployment();
    const mockVerifierAddress = await mockVerifier.getAddress();
    console.log("✅ MockRiscZeroVerifier deployed to:", mockVerifierAddress);
    */

    // Step 3: Deploy Simple RISC0 Test Contract
    console.log("\n3️⃣ Deploying Simple RISC0 Test Contract...");
    const SimpleRISC0Test = await ethers.getContractFactory("SimpleRISC0Test");
    const simpleRisc0Test = await SimpleRISC0Test.deploy(routerAddress);
    await simpleRisc0Test.waitForDeployment();
    const simpleRisc0Address = await simpleRisc0Test.getAddress();
    console.log("✅ SimpleRISC0Test deployed to:", simpleRisc0Address);

    // Step 4: Deploy Stablecoin Manager
    console.log("\n4️⃣ Deploying Stablecoin Manager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(deployer.address);
    await stablecoinManager.waitForDeployment();
    const stablecoinManagerAddress = await stablecoinManager.getAddress();
    console.log("✅ StablecoinManager deployed to:", stablecoinManagerAddress);


    // Step 5: Deploy LiquidityPoolV3 (without credit system initially)
    console.log("\n6️⃣ Deploying LiquidityPoolV3 (initial deployment)...");
    const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
    const liquidityPool = await LiquidityPoolV3.deploy();
    await liquidityPool.waitForDeployment();
    const liquidityPoolAddress = await liquidityPool.getAddress();
    console.log("✅ LiquidityPoolV3 deployed to:", liquidityPoolAddress);

    // Step 6: Deploy Lending Manager
    console.log("\n5️⃣ Deploying Lending Manager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(deployer.address, liquidityPoolAddress);
    await lendingManager.waitForDeployment();
    const lendingManagerAddress = await lendingManager.getAddress();
    console.log("✅ LendingManager deployed to:", lendingManagerAddress);



     
    // Step 7: Deploy Integrated Credit System
    console.log("\n7️⃣ Deploying Integrated Credit System...");
    const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
    const creditSystem = await IntegratedCreditSystem.deploy(
        simpleRisc0Address,
        liquidityPoolAddress
    );
    await creditSystem.waitForDeployment();
    const creditSystemAddress = await creditSystem.getAddress();
    console.log("✅ IntegratedCreditSystem deployed to:", creditSystemAddress);

    // Step 8: Initialize LiquidityPoolV3 with all dependencies
    console.log("\n8️⃣ Initializing LiquidityPoolV3 with ZK integration...");
    const initTx = await liquidityPool.initialize(
        deployer.address,
        stablecoinManagerAddress,
        lendingManagerAddress,
        creditSystemAddress
    );
    await initTx.wait();
    console.log("✅ LiquidityPoolV3 initialized with ZK integration");

    // Step 9: Set up basic configuration
    console.log("\n9️⃣ Setting up basic configuration...");
    
    // Set lending manager in liquidity pool
    await liquidityPool.setLendingManager(lendingManagerAddress);
    console.log("✅ Lending manager set in liquidity pool");

    // Set liquidator (using deployer for now)
    await liquidityPool.setLiquidator(deployer.address);
    console.log("✅ Liquidator set");

    // Step 10: Verify the integration
    console.log("\n🔍 Verifying ZK integration...");
    
    // Check if credit system is properly connected
    const connectedCreditSystem = await liquidityPool.creditSystem();
    console.log("📋 Connected credit system:", connectedCreditSystem);
    
    // Check ZK proof requirement status
    const zkProofRequired = await liquidityPool.zkProofRequired();
    console.log("🔐 ZK proof required:", zkProofRequired);
    
    // Check if credit system can call liquidity pool
    const minCreditScore = await creditSystem.getMinimumCreditScore();
    console.log("📊 Minimum credit score required:", minCreditScore.toString());

    // Step 11: Save deployment addresses
    console.log("\n💾 Saving deployment addresses...");
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        deployer: deployer.address,
        contracts: {
            riscZeroVerifierRouter: routerAddress,
            //mockRiscZeroVerifier: mockVerifierAddress,
            simpleRisc0Test: simpleRisc0Address,
            stablecoinManager: stablecoinManagerAddress,
            lendingManager: lendingManagerAddress,
            liquidityPoolV3: liquidityPoolAddress,
            integratedCreditSystem: creditSystemAddress
        },
        deploymentTime: new Date().toISOString(),
        zkIntegration: {
            enabled: true,
            proofRequired: zkProofRequired,
            minCreditScore: minCreditScore.toString()
        }
    };

    const deploymentPath = path.join(__dirname, "../deployment-zk-integrated.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("✅ Deployment info saved to:", deploymentPath);

    // Step 12: Display final summary
    console.log("\n🎉 ZK-Integrated System Deployment Complete!");
    console.log("=" .repeat(60));
    console.log("📋 Deployment Summary:");
    console.log("   • RISC Zero Verifier Router:", routerAddress);
    //console.log("   • Mock RISC Zero Verifier:", mockVerifierAddress);
    console.log("   • Simple RISC0 Test:", simpleRisc0Address);
    console.log("   • Stablecoin Manager:", stablecoinManagerAddress);
    console.log("   • Lending Manager:", lendingManagerAddress);
    console.log("   • LiquidityPoolV3:", liquidityPoolAddress);
    console.log("   • Integrated Credit System:", creditSystemAddress);
    console.log("\n🔐 ZK Integration Status:");
    console.log("   • ZK Proof Required:", zkProofRequired);
    console.log("   • Minimum Credit Score:", minCreditScore.toString());
    console.log("   • Credit System Connected:", connectedCreditSystem === creditSystemAddress);
    
    console.log("\n📝 Next Steps:");
    console.log("   1. Add verifiers to the RISC Zero Router");
    console.log("   2. Configure collateral tokens and price feeds");
    console.log("   3. Test ZK proof submission and verification");
    console.log("   4. Test borrowing with ZK-verified credit scores");
    
    console.log("\n🔗 Test Commands:");
    console.log("   • Test ZK proof: npx hardhat run scripts/testZKProof.js");
    console.log("   • Test borrowing: npx hardhat run scripts/testZKBorrowing.js");
    console.log("   • Check status: npx hardhat run scripts/checkZKStatus.js");

    return deploymentInfo;
}

// Handle errors
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }); 