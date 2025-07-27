// Complete Deployment and Demo Script for ZK Proof Integration
// This script deploys all contracts and runs the full demo

const { ethers } = require("hardhat");

async function deployContracts() {
    console.log("🚀 Deploying all contracts for ZK Proof Integration Demo");

    const [deployer, user] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Demo user account:", user.address);
    console.log("Deployer balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

    const contracts = {};

    //Deploy RiscZeroVerifierRouter
    console.log("\n📋 Step 1: Deploying RISC Zero Verifier...");

    // for demo purposes, we use a mock verifier that accepts any proof
    const MockVerifierFactory = await ethers.getContractFactory("MockRiscZeroVerifier");
    contracts.mockVerifier = await MockVerifierFactory.deploy();
    await contracts.mockVerifier.deployed();
    console.log("✅ MockRiscZeroVerifier deployed to:", await contracts.mockVerifier.address);

    /* // Deploy SimpleRISC0Test
    console.log("\n📋 Step 2: Deploying SimpleRISC0Test...");
    const SimpleRISC0TestFactory = await ethers.getContractFactory("SimpleRISC0Test");
    contracts.risc0Test = await SimpleRISC0TestFactory.deploy(await contracts.mockVerifier.address);
    await contracts.risc0Test.deployed();
    console.log("✅ SimpleRISC0Test deployed to:", await contracts.risc0Test.address);*/

    // Replace this section in deploy-and-demo.js:
    console.log("\n📋 Step 2: Deploying SimpleRISC0Test...");
    const SimpleRISC0TestFactory = await ethers.getContractFactory("SimpleRISC0Test");
    // Instead of MockRiscZeroVerifier, use the real one:
    const REAL_VERIFIER_ADDRESS = "0xD0141E899a65C95a556fE2B27e5982A6DE7fDD7A"; // real address of Risc0
    contracts.risc0Test = await SimpleRISC0TestFactory.deploy(REAL_VERIFIER_ADDRESS);

    //GlintToken and MockPriceFeed for collateral
    console.log("\n📋 Step 3: Deploying GlintToken...");
    const GlintTokenFactory = await ethers.getContractFactory("GlintToken");
    const initialSupply = ethers.utils.parseUnits("1000000", 18);
    contracts.glintToken = await GlintTokenFactory.deploy(initialSupply);
    await contracts.glintToken.deployed();
    console.log("✅ GlintToken deployed to:", await contracts.glintToken.address);

    console.log("\n📋 Step 4: Deploying MockPriceFeed for GlintToken...");
    const MockPriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
    contracts.glintPriceFeed = await MockPriceFeedFactory.deploy(
        ethers.utils.parseUnits("1.50", 8), // 1.50 dolar price
        8 // 8 decimals is chainlink standard
    );
    await contracts.glintPriceFeed.deployed();
    console.log("✅ MockPriceFeed deployed to:", await contracts.glintPriceFeed.address);

    console.log("\n📋 Step 5: Deploying StablecoinManager...");
    const StablecoinManagerFactory = await ethers.getContractFactory("StablecoinManager");
    contracts.stablecoinManager = await StablecoinManagerFactory.deploy(deployer.address);
    await contracts.stablecoinManager.deployed();
    console.log("✅ StablecoinManager deployed to:", await contracts.stablecoinManager.address);

    // LendingManager as required by LiquidityPool
    console.log("\n📋 Step 6: Deploying LendingManager...");
    // Note: LendingManager has a circular dependency with LiquidityPool
    // We  deploy it first with a temporary address, then update it later
    console.log("\n📋 Step 4: Deploying LendingManager...");
    const LendingManagerFactory = await ethers.getContractFactory("LendingManager");
    contracts.lendingManager = await LendingManagerFactory.deploy(
        deployer.address, // initialOwner
        ethers.ZeroAddress // temporary liquidityPool address, will be updated later
    );
    await contracts.lendingManager.deployed();
    console.log("✅ LendingManager deployed to:", await contracts.lendingManager.address);

    // Deploy IntegratedCreditSystem
    console.log("\n📋 Step 7: Deploying IntegratedCreditSystem...");
    console.log("\n📋 Step 5: Deploying IntegratedCreditSystem...");
    const IntegratedCreditSystemFactory = await ethers.getContractFactory("IntegratedCreditSystem");
    contracts.creditSystem = await IntegratedCreditSystemFactory.deploy(
        await contracts.risc0Test.address,
        ethers.ZeroAddress // Will be set after LiquidityPool deployment
    );
    await contracts.creditSystem.deployed();
    console.log("✅ IntegratedCreditSystem deployed to:", await contracts.creditSystem.address);

    //LiquidityPool
    console.log("\n📋 Step 8: Deploying LiquidityPool...");
    console.log("\n📋 Step 6: Deploying LiquidityPool...");
    const LiquidityPoolFactory = await ethers.getContractFactory("LiquidityPool");
    contracts.liquidityPool = await LiquidityPoolFactory.deploy();
    await contracts.liquidityPool.deployed();

    // Initialize the upgradeable contract with temporary addresses
    await contracts.liquidityPool.initialize(
        deployer.address, // initialOwner
        await contracts.stablecoinManager.address,
        await contracts.lendingManager.address, // temporary, will be updated
        ethers.ZeroAddress // temporary, will be set later
    );
    console.log("✅ LiquidityPool deployed and initialized to:", await contracts.liquidityPool.address);

    // circular dependencies will be fixed by redeploying with correct addresses
    console.log("\n📋 Step 9: Fixing circular dependencies...");
    console.log("\n📋 Step 7: Fixing circular dependencies...");

    // re deploy LendingManager with correct LiquidityPool address
    const LendingManagerFactory2 = await ethers.getContractFactory("LendingManager");
    const newLendingManager = await LendingManagerFactory2.deploy(
        deployer.address, // initialOwner
        await contracts.liquidityPool.address // correct liquidityPool address
    );
    await newLendingManager.deployed();
    contracts.lendingManager = newLendingManager;
    console.log("✅ LendingManager redeployed with correct pool address:", await contracts.lendingManager.address);

    // update LiquidityPool to use the new lending manager
    await contracts.liquidityPool.setLendingManager(await contracts.lendingManager.address);
    console.log("✅ LiquidityPool updated with new lending manager");

    // IntegratedCreditSystem deployed again with correct LiquidityPool address
    const IntegratedCreditSystemFactory2 = await ethers.getContractFactory("IntegratedCreditSystem");
    const newCreditSystem = await IntegratedCreditSystemFactory2.deploy(
        await contracts.risc0Test.address,
        await contracts.liquidityPool.address
    );
    await newCreditSystem.deployed();
    contracts.creditSystem = newCreditSystem;
    console.log("✅ IntegratedCreditSystem redeployed with correct pool address:", await contracts.creditSystem.address);

    // Update LiquidityPool to use the new credit system
    await contracts.liquidityPool.setCreditSystem(await contracts.creditSystem.address);
    console.log("✅ LiquidityPool updated with new credit system");

    // demoTester
    console.log("\n📋 Step 10: Deploying DemoTester...");
    console.log("\n📋 Step 8: Deploying DemoTester...");
    const DemoTesterFactory = await ethers.getContractFactory("DemoTester");
    contracts.demoTester = await DemoTesterFactory.deploy(
        await contracts.creditSystem.address,
        await contracts.risc0Test.address,
        await contracts.liquidityPool.address
    );
    await contracts.demoTester.deployed();
    console.log("✅ DemoTester deployed to:", await contracts.demoTester.address);

    return contracts;
}

async function setupForDemo(contracts) {
    console.log("\n🔧 Setting up contracts for demo...");

    const [deployer, user] = await ethers.getSigners();

    // Enable demo mode on RISC0 verifier
    await contracts.risc0Test.setDemoMode(true);
    console.log("✅ Demo mode enabled on RISC0 verifier");

    // Add funds to liquidity pool
    const fundAmount = ethers.parseEther("100");
    await deployer.sendTransaction({
        to: await contracts.liquidityPool.address,
        value: fundAmount
    });
    console.log(`✅ Added ${ethers.formatEther(fundAmount)} ETH to liquidity pool`);

    console.log("Setting up GlintToken as collateral...");
    await contracts.liquidityPool.setAllowedCollateral(await contracts.glintToken.address, true);
    console.log("✅ GlintToken set as allowed collateral");

    await contracts.liquidityPool.setPriceFeed(
        await contracts.glintToken.address,
        await contracts.glintPriceFeed.address
    );
    console.log("✅ GlintToken price feed set");

    try {
        const tokenValue = await contracts.liquidityPool.getTokenValue(await contracts.glintToken.address);
        console.log("✅ GlintToken price verified:", ethers.formatUnits(tokenValue, 18), "USD");
    } catch (error) {
        console.log("⚠️  Price feed verification failed:", error.message);
    }

    // Give user some GlintTokens for collateral
    const glintAmount = ethers.utils.parseUnits("1000", 18);
    await contracts.glintToken.transfer(user.address, glintAmount);
    console.log(`✅ Transferred ${ethers.formatUnits(glintAmount, 18)} GLINT to demo user`);
}

async function runDemo(contracts) {
    console.log("\n🎭 Running Complete ZK Proof Integration Demo");

    const [deployer, user] = await ethers.getSigners();

    console.log("Demo participant:", user.address);
    console.log("User balance:", ethers.formatEther(await user.provider.getBalance(user.address)), "ETH");

    // Check demo mode
    const isDemoReady = await contracts.risc0Test.isDemoMode();
    console.log("Demo mode active:", isDemoReady);

    if (!isDemoReady) {
        console.log("❌ Demo mode is not active. Enabling...");
        await contracts.risc0Test.setDemoMode(true);
    }

    //Check initial state
    console.log("\n📊 Initial state:");
    const [hasTradFi, hasAccount, hasNesting, finalScore, isEligible] =
        await contracts.demoTester.getUserStatus(user.address);

    console.log("- Has TradFi verification:", hasTradFi);
    console.log("- Has Account verification:", hasAccount);
    console.log("- Has Nesting verification:", hasNesting);
    console.log("- Final credit score:", finalScore.toString());
    console.log("- Eligible to borrow:", isEligible);

    //Run complete demo flow
    console.log("\n🚀 Running complete demo flow...");

    const creditScore = 750; // Good credit score
    const borrowAmount = ethers.parseEther("1"); // Borrow 1 ETH

    try {
        const tx = await contracts.demoTester.connect(user).runCompleteDemo(creditScore, borrowAmount);
        const receipt = await tx.wait();

        console.log("✅ Demo transaction completed successfully!");
        console.log("Transaction hash:", tx.hash);
        console.log("Gas used:", receipt.gasUsed.toString());

        // Extract events
        console.log("\n📝 Events from demo:");
        for (const log of receipt.logs) {
            try {
                const parsed = contracts.demoTester.interface.parseLog(log);
                console.log(`- ${parsed.name}:`, parsed.args);
            } catch (e) {
                // Ignore logs from other contracts
            }
        }

    } catch (error) {
        console.log("❌ Demo transaction failed:", error.message);
        return false;
    }

    //  Check final state
    console.log("\n📊 Final state:");
    const [finalTradFi, finalAccount, finalNesting, finalFinalScore, finalEligible] =
        await contracts.demoTester.getUserStatus(user.address);

    console.log("- Has TradFi verification:", finalTradFi);
    console.log("- Has Account verification:", finalAccount);
    console.log("- Has Nesting verification:", finalNesting);
    console.log("- Final credit score:", finalFinalScore.toString());
    console.log("- Eligible to borrow:", finalEligible);

    // Check borrowing result
    const userDebt = await contracts.liquidityPool.userDebt(user.address);
    console.log("- Current debt:", ethers.formatEther(userDebt), "ETH");

    //Test individual proof generation
    console.log("\n🔍 Testing individual proof generation:");

    try {
        const [accountSeal, accountJournal] = await contracts.demoTester.generateAccountProof();
        const [tradfiSeal, tradfiJournal] = await contracts.demoTester.generateTradFiProof(750);
        const [nestingSeal, nestingJournal] = await contracts.demoTester.generateNestingProof(750);

        console.log("✅ Successfully generated all proof types:");
        console.log("- Account proof seal length:", accountSeal.length);
        console.log("- TradFi proof seal length:", tradfiSeal.length);
        console.log("- Nesting proof seal length:", nestingSeal.length);

    } catch (error) {
        console.log("❌ Proof generation failed:", error.message);
    }

    return finalEligible && userDebt.gt(0);
}

async function displaySummary(contracts, success) {
    console.log("\n" + "=".repeat(60));
    console.log("🎯 DEMO SUMMARY");
    console.log("=".repeat(60));

    console.log("\n📋 Deployed Contracts:");
    console.log("- LiquidityPool:", await contracts.liquidityPool.address);
    console.log("- IntegratedCreditSystem:", await contracts.creditSystem.address);
    console.log("- SimpleRISC0Test:", await contracts.risc0Test.address);
    console.log("- DemoTester:", await contracts.demoTester.address);
    console.log("- StablecoinManager:", await contracts.stablecoinManager.address);
    console.log("- LendingManager:", await contracts.lendingManager.address);
    console.log("- GlintToken:", await contracts.glintToken.address);
    console.log("- GlintPriceFeed:", await contracts.glintPriceFeed.address);

    if (success) {
        console.log("\n🏆 DEMO RESULT: SUCCESS!");
        console.log("✅ User successfully borrowed after ZK proof verification");
        console.log("✅ Complete end-to-end flow working");
        console.log("✅ Ready for Friday presentation!");
    } else {
        console.log("\n⚠️  DEMO RESULT: Issues detected");
        console.log("❌ User may not have borrowed successfully");
        console.log("🔧 Check logs above for debugging information");
    }

    console.log("\n🚀 Next Steps for Production:");
    console.log("1. Replace MockRiscZeroVerifier with real RISC Zero verifier");
    console.log("2. Integrate with Risc0 team for real proof generation");
    console.log("3. Deploy to testnet for external testing");
    console.log("4. Add more comprehensive error handling");
}

// Create a simple mock verifier for demo purposes, actually have a contract for this now, this is outdated
const mockVerifierCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external pure {
        // For demo purposes, always succeed
        // In production, this would be the real RISC Zero verifier
        require(seal.length > 0, "Empty seal");
        require(imageId != bytes32(0), "Empty image ID");
        require(journalDigest != bytes32(0), "Empty journal digest");
    }
}`;

// Main execution function
async function main() {
    try {
        console.log("🎬 Starting Complete ZK Proof Integration Deployment and Demo");
        console.log("Timestamp:", new Date().toISOString());

        // Step 1: Deploy all contracts
        const contracts = await deployContracts();

        // Step 2: Setup for demo
        await setupForDemo(contracts);

        // Step 3: Run the demo
        const success = await runDemo(contracts);

        // Step 4: Display summary
        await displaySummary(contracts, success);

        console.log("\n✅ Deployment and demo completed!");

    } catch (error) {
        console.error("\n❌ Deployment/Demo failed:");
        console.error(error.message);
        if (error.stack) {
            console.error("\nStack trace:");
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// No top-level await or promise usage outside functions. main() is only called if run directly.
module.exports = { main };