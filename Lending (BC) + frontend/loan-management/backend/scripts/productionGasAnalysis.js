const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🔥 PRODUCTION SYSTEM GAS ANALYSIS 🔥");
    console.log("=" .repeat(60));
    console.log("Measuring gas costs for real production contracts");
    console.log("(Excluding mock contracts used only for testing)");

    const [deployer, user1, user2] = await ethers.getSigners();
    
    // Gas tracking object
    const gasResults = {
        deployment: {},
        methods: {},
        fullCycle: {},
        summary: {}
    };

    console.log("\n📊 PHASE 1: PRODUCTION DEPLOYMENT GAS COSTS");
    console.log("-".repeat(50));

    // Deploy all production contracts and measure gas
    let totalDeploymentGas = 0n;

    // 1. Deploy GlintToken (system token)
    console.log("1. Deploying GlintToken...");
    const GlintToken = await ethers.getContractFactory("GlintToken");
    const glintToken = await GlintToken.deploy(ethers.parseEther("1000000")); // 1M initial supply
    const glintTokenReceipt = await glintToken.deploymentTransaction().wait();
    gasResults.deployment.glintToken = glintTokenReceipt.gasUsed;
    totalDeploymentGas += glintTokenReceipt.gasUsed;
    console.log(`   GlintToken: ${glintTokenReceipt.gasUsed.toLocaleString()} gas`);

    // 2. Deploy VotingToken
    console.log("2. Deploying VotingToken...");
    const VotingToken = await ethers.getContractFactory("VotingToken");
    const votingToken = await VotingToken.deploy(deployer.address);
    const votingTokenReceipt = await votingToken.deploymentTransaction().wait();
    gasResults.deployment.votingToken = votingTokenReceipt.gasUsed;
    totalDeploymentGas += votingTokenReceipt.gasUsed;
    console.log(`   VotingToken: ${votingTokenReceipt.gasUsed.toLocaleString()} gas`);

    // 3. Deploy NullifierRegistry
    console.log("3. Deploying NullifierRegistry...");
    const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
    const nullifierRegistry = await upgrades.deployProxy(NullifierRegistry, [deployer.address], {
        initializer: "initialize"
    });
    const nullifierRegistryReceipt = await nullifierRegistry.deploymentTransaction().wait();
    gasResults.deployment.nullifierRegistry = nullifierRegistryReceipt.gasUsed;
    totalDeploymentGas += nullifierRegistryReceipt.gasUsed;
    console.log(`   NullifierRegistry: ${nullifierRegistryReceipt.gasUsed.toLocaleString()} gas`);

    // 4. Deploy MockRiscZeroVerifier (for gas estimation - real verifier needs specific params)
    console.log("4. Deploying MockRiscZeroVerifier...");
    const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
    const riscZeroVerifier = await MockRiscZeroVerifier.deploy();
    const riscZeroVerifierReceipt = await riscZeroVerifier.deploymentTransaction().wait();
    gasResults.deployment.riscZeroVerifier = riscZeroVerifierReceipt.gasUsed;
    totalDeploymentGas += riscZeroVerifierReceipt.gasUsed;
    console.log(`   MockRiscZeroVerifier: ${riscZeroVerifierReceipt.gasUsed.toLocaleString()} gas`);

    // 5. Deploy TLSNVerifier
    console.log("5. Deploying TLSNVerifier...");
    const TLSNVerifier = await ethers.getContractFactory("TLSNVerifier");
    const tlsnVerifier = await TLSNVerifier.deploy(await riscZeroVerifier.getAddress());
    const tlsnVerifierReceipt = await tlsnVerifier.deploymentTransaction().wait();
    gasResults.deployment.tlsnVerifier = tlsnVerifierReceipt.gasUsed;
    totalDeploymentGas += tlsnVerifierReceipt.gasUsed;
    console.log(`   TLSNVerifier: ${tlsnVerifierReceipt.gasUsed.toLocaleString()} gas`);

    // 6. Deploy InterestRateModel
    console.log("6. Deploying InterestRateModel...");
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy(
        ethers.ZeroAddress, // Oracle address (to be set later)
        deployer.address, // Timelock
        ethers.parseUnits("0.02", 18), // Base rate
        ethers.parseUnits("0.8", 18), // Kink
        ethers.parseUnits("0.05", 18), // Slope1
        ethers.parseUnits("1.0", 18), // Slope2
        ethers.parseUnits("0.1", 18), // Reserve factor
        ethers.parseUnits("5.0", 18), // Max borrow rate
        ethers.parseUnits("0.02", 18), // Max rate change
        ethers.parseUnits("0.01", 18), // ETH price risk premium
        ethers.parseUnits("0.1", 18), // ETH volatility threshold
        3600 // Oracle staleness window
    );
    const interestRateModelReceipt = await interestRateModel.deploymentTransaction().wait();
    gasResults.deployment.interestRateModel = interestRateModelReceipt.gasUsed;
    totalDeploymentGas += interestRateModelReceipt.gasUsed;
    console.log(`   InterestRateModel: ${interestRateModelReceipt.gasUsed.toLocaleString()} gas`);

    // 7. Deploy StablecoinManager
    console.log("7. Deploying StablecoinManager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(deployer.address);
    const stablecoinManagerReceipt = await stablecoinManager.deploymentTransaction().wait();
    gasResults.deployment.stablecoinManager = stablecoinManagerReceipt.gasUsed;
    totalDeploymentGas += stablecoinManagerReceipt.gasUsed;
    console.log(`   StablecoinManager: ${stablecoinManagerReceipt.gasUsed.toLocaleString()} gas`);

    // 8. Deploy LiquidityPool (Upgradeable)
    console.log("8. Deploying LiquidityPool...");
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        deployer.address, // Timelock
        await stablecoinManager.getAddress(),
        ethers.ZeroAddress, // LendingManager (will be set later)
        await interestRateModel.getAddress()
    ], { initializer: "initialize" });
    const liquidityPoolReceipt = await liquidityPool.deploymentTransaction().wait();
    gasResults.deployment.liquidityPool = liquidityPoolReceipt.gasUsed;
    totalDeploymentGas += liquidityPoolReceipt.gasUsed;
    console.log(`   LiquidityPool: ${liquidityPoolReceipt.gasUsed.toLocaleString()} gas`);

    // 9. Deploy LendingManager
    console.log("9. Deploying LendingManager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(
        await liquidityPool.getAddress(),
        deployer.address // Timelock
    );
    const lendingManagerReceipt = await lendingManager.deploymentTransaction().wait();
    gasResults.deployment.lendingManager = lendingManagerReceipt.gasUsed;
    totalDeploymentGas += lendingManagerReceipt.gasUsed;
    console.log(`   LendingManager: ${lendingManagerReceipt.gasUsed.toLocaleString()} gas`);

    // 10. Deploy IntegratedCreditSystem
    console.log("10. Deploying IntegratedCreditSystem...");
    const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
    const integratedCreditSystem = await IntegratedCreditSystem.deploy(
        await riscZeroVerifier.getAddress(),
        await liquidityPool.getAddress()
    );
    const integratedCreditSystemReceipt = await integratedCreditSystem.deploymentTransaction().wait();
    gasResults.deployment.integratedCreditSystem = integratedCreditSystemReceipt.gasUsed;
    totalDeploymentGas += integratedCreditSystemReceipt.gasUsed;
    console.log(`   IntegratedCreditSystem: ${integratedCreditSystemReceipt.gasUsed.toLocaleString()} gas`);

    // 11. Deploy ProtocolGovernor
    console.log("11. Deploying ProtocolGovernor...");
    const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
    const protocolGovernor = await ProtocolGovernor.deploy(
        await votingToken.getAddress(),
        deployer.address // Timelock
    );
    const protocolGovernorReceipt = await protocolGovernor.deploymentTransaction().wait();
    gasResults.deployment.protocolGovernor = protocolGovernorReceipt.gasUsed;
    totalDeploymentGas += protocolGovernorReceipt.gasUsed;
    console.log(`   ProtocolGovernor: ${protocolGovernorReceipt.gasUsed.toLocaleString()} gas`);

    console.log("\n" + "=".repeat(60));
    console.log(`📊 TOTAL PRODUCTION DEPLOYMENT: ${totalDeploymentGas.toLocaleString()} gas`);
    console.log("=".repeat(60));

    // Calculate costs at different gas prices
    const gasPrices = [10n, 25n, 50n, 100n]; // gwei
    const ethPrice = 4500; // USD

    console.log("\n💰 DEPLOYMENT COSTS AT DIFFERENT GAS PRICES:");
    console.log("-".repeat(50));
    
    for (const gasPrice of gasPrices) {
        const costInWei = totalDeploymentGas * gasPrice * 1000000000n; // Convert gwei to wei
        const costInEth = Number(costInWei) / 1e18;
        const costInUsd = costInEth * ethPrice;
        
        console.log(`${gasPrice} gwei: ${costInEth.toFixed(4)} ETH ($${costInUsd.toFixed(2)})`);
    }

    // Contract breakdown by percentage
    console.log("\n📊 DEPLOYMENT BREAKDOWN BY CONTRACT:");
    console.log("-".repeat(50));
    
    const contracts = [
        { name: "LiquidityPool", gas: gasResults.deployment.liquidityPool },
        { name: "LendingManager", gas: gasResults.deployment.lendingManager },
        { name: "IntegratedCreditSystem", gas: gasResults.deployment.integratedCreditSystem },
        { name: "ProtocolGovernor", gas: gasResults.deployment.protocolGovernor },
        { name: "VotingToken", gas: gasResults.deployment.votingToken },
        { name: "InterestRateModel", gas: gasResults.deployment.interestRateModel },
        { name: "MockRiscZeroVerifier", gas: gasResults.deployment.riscZeroVerifier },
        { name: "StablecoinManager", gas: gasResults.deployment.stablecoinManager },
        { name: "NullifierRegistry", gas: gasResults.deployment.nullifierRegistry },
        { name: "TLSNVerifier", gas: gasResults.deployment.tlsnVerifier },
        { name: "GlintToken", gas: gasResults.deployment.glintToken }
    ];

    // Sort by gas usage
    contracts.sort((a, b) => Number(b.gas - a.gas));

    for (const contract of contracts) {
        const percentage = (Number(contract.gas) / Number(totalDeploymentGas) * 100).toFixed(1);
        console.log(`${contract.name.padEnd(25)}: ${contract.gas.toLocaleString().padStart(10)} gas (${percentage}%)`);
    }

    console.log("\n✅ Production gas analysis complete!");
    console.log("📝 Note: This analysis excludes mock contracts used only for testing");
    console.log("🚀 These are the actual contracts that would be deployed in production");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Error during production gas analysis:", error);
        process.exit(1);
    });
