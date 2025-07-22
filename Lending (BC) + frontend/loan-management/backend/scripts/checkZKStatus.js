const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🔍 Checking ZK Integration Status...\n");

    // Load deployment info
    const deploymentPath = path.join(__dirname, "../deployment-zk-integrated.json");
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ Deployment file not found. Please run deployZKIntegratedSystem.js first.");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const [deployer] = await ethers.getSigners();

    console.log("📋 Deployment Info:");
    console.log("   • Network:", deploymentInfo.network);
    console.log("   • Deployer:", deploymentInfo.deployer);
    console.log("   • Deployment Time:", deploymentInfo.deploymentTime);

    // Load contracts
    const liquidityPool = await ethers.getContractAt("LiquidityPoolV3", deploymentInfo.contracts.liquidityPoolV3);
    const creditSystem = await ethers.getContractAt("IntegratedCreditSystem", deploymentInfo.contracts.integratedCreditSystem);
    const simpleRisc0Test = await ethers.getContractAt("SimpleRISC0Test", deploymentInfo.contracts.simpleRisc0Test);
    const verifierRouter = await ethers.getContractAt("RiscZeroVerifierRouter", deploymentInfo.contracts.riscZeroVerifierRouter);

    console.log("\n🏗️ Contract Addresses:");
    console.log("   • LiquidityPoolV3:", deploymentInfo.contracts.liquidityPoolV3);
    console.log("   • IntegratedCreditSystem:", deploymentInfo.contracts.integratedCreditSystem);
    console.log("   • SimpleRISC0Test:", deploymentInfo.contracts.simpleRisc0Test);
    console.log("   • RiscZeroVerifierRouter:", deploymentInfo.contracts.riscZeroVerifierRouter);
    console.log("   • MockRiscZeroVerifier:", deploymentInfo.contracts.mockRiscZeroVerifier);
    console.log("   • StablecoinManager:", deploymentInfo.contracts.stablecoinManager);
    console.log("   • LendingManager:", deploymentInfo.contracts.lendingManager);

    // Check ZK integration status
    console.log("\n🔐 ZK Integration Status:");
    
    try {
        const zkProofRequired = await liquidityPool.zkProofRequired();
        const connectedCreditSystem = await liquidityPool.creditSystem();
        const minCreditScore = await creditSystem.getMinimumCreditScore();
        
        console.log("   • ZK Proof Required:", zkProofRequired);
        console.log("   • Credit System Connected:", connectedCreditSystem);
        console.log("   • Minimum Credit Score:", minCreditScore.toString());
        console.log("   • Integration Active:", connectedCreditSystem !== "0x0000000000000000000000000000000000000000");
    } catch (error) {
        console.log("   ❌ Error checking ZK status:", error.message);
    }

    // Check verifier status
    console.log("\n🔍 Verifier Status:");
    
    try {
        const verifierAddress = await simpleRisc0Test.getVerifierAddress();
        console.log("   • SimpleRISC0Test Verifier:", verifierAddress);
        console.log("   • Verifier Connected:", verifierAddress !== "0x0000000000000000000000000000000000000000");
    } catch (error) {
        console.log("   ❌ Error checking verifier status:", error.message);
    }

    // Check liquidity pool status
    console.log("\n💰 Liquidity Pool Status:");
    
    try {
        const poolBalance = await ethers.provider.getBalance(await liquidityPool.getAddress());
        const isPaused = await liquidityPool.isPaused();
        const owner = await liquidityPool.getAdmin();
        const liquidator = await liquidityPool.liquidator();
        
        console.log("   • Pool Balance:", ethers.formatEther(poolBalance), "ETH");
        console.log("   • Paused:", isPaused);
        console.log("   • Owner:", owner);
        console.log("   • Liquidator:", liquidator);
    } catch (error) {
        console.log("   ❌ Error checking pool status:", error.message);
    }

    // Check credit system configuration
    console.log("\n📊 Credit System Configuration:");
    
    try {
        const userProfile = await creditSystem.getUserCreditProfile(deployer.address);
        console.log("   • Deployer Profile:", {
            hasTradFi: userProfile.hasTradFi,
            hasAccount: userProfile.hasAccount,
            hasNesting: userProfile.hasNesting,
            finalScore: userProfile.finalScore.toString(),
            isEligible: userProfile.isEligible,
            lastUpdate: userProfile.lastUpdate.toString()
        });
    } catch (error) {
        console.log("   ❌ Error checking credit system:", error.message);
    }

    // Check system health
    console.log("\n🏥 System Health Check:");
    
    let healthScore = 0;
    const checks = [];

    // Check 1: ZK integration active
    try {
        const zkRequired = await liquidityPool.zkProofRequired();
        const creditSystemConnected = await liquidityPool.creditSystem();
        if (zkRequired && creditSystemConnected !== "0x0000000000000000000000000000000000000000") {
            healthScore += 25;
            checks.push("✅ ZK integration active");
        } else {
            checks.push("⚠️  ZK integration not fully active");
        }
    } catch (error) {
        checks.push("❌ ZK integration check failed");
    }

    // Check 2: Verifier connected
    try {
        const verifierAddress = await simpleRisc0Test.getVerifierAddress();
        if (verifierAddress !== "0x0000000000000000000000000000000000000000") {
            healthScore += 25;
            checks.push("✅ Verifier connected");
        } else {
            checks.push("❌ Verifier not connected");
        }
    } catch (error) {
        checks.push("❌ Verifier check failed");
    }

    // Check 3: Pool has funds
    try {
        const balance = await ethers.provider.getBalance(await liquidityPool.getAddress());
        if (balance > 0) {
            healthScore += 25;
            checks.push("✅ Pool has funds");
        } else {
            checks.push("⚠️  Pool has no funds");
        }
    } catch (error) {
        checks.push("❌ Pool balance check failed");
    }

    // Check 4: System not paused
    try {
        const isPaused = await liquidityPool.isPaused();
        if (!isPaused) {
            healthScore += 25;
            checks.push("✅ System not paused");
        } else {
            checks.push("❌ System is paused");
        }
    } catch (error) {
        checks.push("❌ Pause status check failed");
    }

    // Display health results
    checks.forEach(check => console.log("   •", check));
    console.log("   • Overall Health Score:", healthScore + "/100");

    // Provide recommendations
    console.log("\n💡 Recommendations:");
    
    if (healthScore < 100) {
        if (healthScore < 50) {
            console.log("   🚨 System needs immediate attention");
        } else if (healthScore < 75) {
            console.log("   ⚠️  System needs some configuration");
        } else {
            console.log("   ✅ System is mostly healthy");
        }
        
        if (healthScore < 75) {
            console.log("   📝 Suggested actions:");
            console.log("      • Run deployZKIntegratedSystem.js to redeploy");
            console.log("      • Fund the liquidity pool");
            console.log("      • Configure collateral tokens and price feeds");
            console.log("      • Test ZK proof submission");
        }
    } else {
        console.log("   🎉 System is fully operational!");
        console.log("   📝 Ready for production use");
    }

    console.log("\n📋 Quick Commands:");
    console.log("   • Test ZK integration: npx hardhat run scripts/testZKIntegration.js");
    console.log("   • Deploy fresh system: npx hardhat run scripts/deployZKIntegratedSystem.js");
    console.log("   • Check deployment: cat deployment-zk-integrated.json");

    return {
        healthScore,
        deploymentInfo,
        checks
    };
}

// Handle errors
main()
    .then((result) => {
        console.log("\n✅ Status check completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Status check failed:", error);
        process.exit(1);
    }); 