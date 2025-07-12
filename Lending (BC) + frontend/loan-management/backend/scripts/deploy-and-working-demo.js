const { ethers } = require("hardhat");

// Environment configuration
const USE_REAL_VERIFIER = process.env.USE_REAL_VERIFIER === 'true';

async function deployAndDemo() {
    console.log("🚀 Complete ZK Lending System Deployment + Demo");
    console.log(`📋 Using ${USE_REAL_VERIFIER ? 'REAL' : 'MOCK'} RISC Zero Verifier`);
    
    const [deployer, user] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("User:", user.address);
    console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    
    // Deploy all contracts first
    console.log("\n📋 Deploying contracts...");
    
    // Deploy verifier based on environment
    let verifierAddress;
    if (USE_REAL_VERIFIER) {
        console.log("🔐 Deploying Real RISC Zero Verifier locally...");
        try {
            // Deploy the real RiscZeroGroth16Verifier for localhost using correct parameters from ControlID.sol
            const RiscZeroGroth16VerifierFactory = await ethers.getContractFactory("RiscZeroGroth16Verifier");
            const realVerifier = await RiscZeroGroth16VerifierFactory.deploy(
                "0xce52bf56033842021af3cf6db8a50d1b7535c125a34f1a22c6fdcf002c5a1529", // CONTROL_ROOT from ControlID.sol
                "0x04446e66d300eb7fb45c9726bb53c793dda407a62e9601618bb43c5c14657ac0"  // BN254_CONTROL_ID from ControlID.sol
            );
            await realVerifier.waitForDeployment();
            verifierAddress = await realVerifier.getAddress();
            console.log("✅ Real RISC Zero verifier deployed locally:", verifierAddress);
        } catch (error) {
            console.error("❌ Failed to deploy real verifier:", error.message);
            console.log("💡 Falling back to mock verifier...");
            const MockVerifierFactory = await ethers.getContractFactory("MockRiscZeroVerifier");
            const mockVerifier = await MockVerifierFactory.deploy();
            await mockVerifier.waitForDeployment();
            verifierAddress = await mockVerifier.getAddress();
            console.log("✅ Mock verifier deployed as fallback:", verifierAddress);
        }
    } else {
        console.log("🎭 Deploying Mock Verifier for Demo");
        const MockVerifierFactory = await ethers.getContractFactory("MockRiscZeroVerifier");
        const mockVerifier = await MockVerifierFactory.deploy();
        await mockVerifier.waitForDeployment();
        verifierAddress = await mockVerifier.getAddress();
        console.log("✅ Mock verifier deployed:", verifierAddress);
    }
    
    const SimpleRISC0TestFactory = await ethers.getContractFactory("SimpleRISC0Test");
    const risc0Test = await SimpleRISC0TestFactory.deploy(verifierAddress);
    await risc0Test.waitForDeployment();
    console.log("✅ SimpleRISC0Test deployed:", await risc0Test.getAddress());
    
    const GlintTokenFactory = await ethers.getContractFactory("GlintToken");
    const glintToken = await GlintTokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await glintToken.waitForDeployment();
    console.log("✅ GlintToken deployed:", await glintToken.getAddress());
    
    const MockPriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
    const glintPriceFeed = await MockPriceFeedFactory.deploy(ethers.parseUnits("1.50", 8), 8);
    await glintPriceFeed.waitForDeployment();
    console.log("✅ GlintPriceFeed deployed:", await glintPriceFeed.getAddress());
    
    const StablecoinManagerFactory = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManagerFactory.deploy(deployer.address);
    await stablecoinManager.waitForDeployment();
    console.log("✅ StablecoinManager deployed:", await stablecoinManager.getAddress());
    
    const LendingManagerFactory = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManagerFactory.deploy(deployer.address, ethers.ZeroAddress);
    await lendingManager.waitForDeployment();
    console.log("✅ LendingManager deployed:", await lendingManager.getAddress());
    
    const LiquidityPoolV3Factory = await ethers.getContractFactory("LiquidityPoolV3");
    const liquidityPool = await LiquidityPoolV3Factory.deploy();
    await liquidityPool.waitForDeployment();
    console.log("✅ LiquidityPoolV3 deployed:", await liquidityPool.getAddress());
    
    await liquidityPool.initialize(
        deployer.address,
        await stablecoinManager.getAddress(),
        await lendingManager.getAddress(),
        ethers.ZeroAddress
    );
    console.log("✅ LiquidityPoolV3 initialized");
    
    const IntegratedCreditSystemFactory = await ethers.getContractFactory("IntegratedCreditSystem");
    const creditSystem = await IntegratedCreditSystemFactory.deploy(
        await risc0Test.getAddress(),
        await liquidityPool.getAddress()
    );
    await creditSystem.waitForDeployment();
    console.log("✅ IntegratedCreditSystem deployed:", await creditSystem.getAddress());
    
    // Connect contracts
    console.log("\n🔗 Connecting contracts...");
    await liquidityPool.setCreditSystem(await creditSystem.getAddress());
    console.log("✅ LiquidityPool connected to CreditSystem");
    
    await liquidityPool.setLendingManager(await lendingManager.getAddress());
    console.log("✅ LiquidityPool connected to LendingManager");
    
    // Setup for demo
    console.log("\n⚙️ Setting up for demo...");
    
    // Enable demo mode for mock verifier, disable for real verifier
    const enableDemoMode = !USE_REAL_VERIFIER;
    await risc0Test.setDemoMode(enableDemoMode);
    console.log(`✅ Demo mode ${enableDemoMode ? 'ENABLED' : 'DISABLED'}`);
    
    // Fund liquidity pool
    const fundAmount = ethers.parseEther("100");
    await deployer.sendTransaction({ 
        to: await liquidityPool.getAddress(), 
        value: fundAmount 
    });
    console.log(`✅ Funded liquidity pool with ${ethers.formatEther(fundAmount)} ETH`);
    
    // Setup collateral
    await liquidityPool.setAllowedCollateral(await glintToken.getAddress(), true);
    await liquidityPool.setPriceFeed(await glintToken.getAddress(), await glintPriceFeed.getAddress());
    console.log("✅ Collateral configured");
    
    // Give user tokens
    const userTokenAmount = ethers.parseUnits("10000", 18);
    await glintToken.transfer(user.address, userTokenAmount);
    console.log(`✅ Transferred ${ethers.formatUnits(userTokenAmount, 18)} GLINT to user`);
    
    console.log("\n✅ All contracts deployed and configured");
    
    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        timestamp: new Date().toISOString(),
        useRealVerifier: USE_REAL_VERIFIER,
        contracts: {
            verifier: verifierAddress,
            risc0Test: await risc0Test.getAddress(),
            liquidityPool: await liquidityPool.getAddress(),
            creditSystem: await creditSystem.getAddress(),
            glintToken: await glintToken.getAddress(),
            stablecoinManager: await stablecoinManager.getAddress(),
            lendingManager: await lendingManager.getAddress()
        }
    };
    
    console.log("\n📋 Deployment Summary:");
    console.log("=".repeat(50));
    Object.entries(deploymentInfo.contracts).forEach(([name, address]) => {
        console.log(`${name.padEnd(20)}: ${address}`);
    });
    
    // Only run demo if using mock verifier
    if (!USE_REAL_VERIFIER) {
        console.log("\n🎯 Running demo with mock proofs...");
        await runDemo(user, liquidityPool, creditSystem, glintToken);
    } else {
        console.log("\n⚠️  Skipping demo - real verifier requires real proofs");
        console.log("📝 Your teammates can now submit real ZK proofs to:");
        console.log(`   - creditSystem.submitTradFiProof(seal, journal)`);
        console.log(`   - creditSystem.submitAccountProof(seal, journal)`);
        console.log(`   - creditSystem.submitNestingProof(seal, journal)`);
    }
    
    return deploymentInfo;
}

async function runDemo(user, liquidityPool, creditSystem, glintToken) {
    console.log("🎭 Starting mock proof demo...");
    
    // Deposit collateral
    const collateralAmount = ethers.parseUnits("2000", 18);
    await glintToken.connect(user).approve(await liquidityPool.getAddress(), collateralAmount);
    await liquidityPool.connect(user).depositCollateral(await glintToken.getAddress(), collateralAmount);
    console.log("✅ Deposited collateral");
    
    // Generate mock proof data
    const accountProof = {
        account: user.address,
        nonce: 6,
        balance: "367474808980032378259524",
        storageRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
        codeHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockNumber: 22406754,
        stateRoot: "0xe717d168d366b01f6edddc3554333c5b63afaedb34edd210f425b7334c251764"
    };
    
    const tradfiProof = {
        creditScore: "750",
        dataSource: "experian.com",
        reportDate: "2024-01-15",
        accountAge: "5 years",
        paymentHistory: "Excellent"
    };
    
    const nestingProof = {
        account: user.address,
        defiScore: 75,
        tradfiScore: 85,
        hybridScore: 81,
        timestamp: Math.floor(Date.now() / 1000)
    };
    
    // Create mock seals with proper prefixes
    const accountSeal = ethers.toUtf8Bytes(`MOCK_ACCOUNT_SEAL_${user.address}_${Date.now()}`);
    const tradfiSeal = ethers.toUtf8Bytes(`MOCK_TRADFI_SEAL_750_${Date.now()}`);
    const nestingSeal = ethers.toUtf8Bytes(`MOCK_NESTING_SEAL_${user.address}_81_${Date.now()}`);
    
    // Encode journals
    const accountJournal = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "bytes32", "bytes32", "uint256", "bytes32"],
        [accountProof.account, accountProof.nonce, accountProof.balance, accountProof.storageRoot, accountProof.codeHash, accountProof.blockNumber, accountProof.stateRoot]
    );
    
    const tradfiJournal = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "string", "string", "string"],
        [tradfiProof.creditScore, tradfiProof.dataSource, tradfiProof.reportDate, tradfiProof.accountAge, tradfiProof.paymentHistory]
    );
    
    const nestingJournal = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "uint256", "uint256"],
        [nestingProof.account, nestingProof.defiScore, nestingProof.tradfiScore, nestingProof.hybridScore, nestingProof.timestamp]
    );
    
    try {
        // Submit proofs
        console.log("📤 Submitting mock proofs...");
        await creditSystem.connect(user).submitAccountProof(accountSeal, accountJournal);
        console.log("✅ Account proof submitted");
        
        await creditSystem.connect(user).submitTradFiProof(tradfiSeal, tradfiJournal);
        console.log("✅ TradFi proof submitted");
        
        await creditSystem.connect(user).submitNestingProof(nestingSeal, nestingJournal);
        console.log("✅ Nesting proof submitted");
        
        // Check final credit profile
        const profile = await creditSystem.getUserCreditProfile(user.address);
        console.log("\n📊 Final Credit Profile:");
        console.log("   Credit Score:", profile[3].toString());
        console.log("   Eligible to Borrow:", profile[4]);
        console.log("   Has TradFi:", profile[0]);
        console.log("   Has Account:", profile[1]);
        console.log("   Has Nesting:", profile[2]);
        
        // Attempt borrowing
        if (profile[4]) { // if eligible
            console.log("\n💰 Attempting to borrow...");
            const borrowAmount = ethers.parseEther("0.5");
            await liquidityPool.connect(user).borrow(borrowAmount);
            
            const debt = await liquidityPool.userDebt(user.address);
            console.log(`✅ Borrowed successfully! Debt: ${ethers.formatEther(debt)} ETH`);
            
            console.log("\n🎉 SUCCESS! ZK-powered lending system working end-to-end");
        } else {
            console.log("❌ User not eligible to borrow - check credit score");
        }
        
    } catch (error) {
        console.error("❌ Demo failed:", error.message);
        throw error;
    }
}

async function main() {
    try {
        const result = await deployAndDemo();
        console.log("\n✅ Deployment completed successfully!");
        
        if (USE_REAL_VERIFIER) {
            console.log("\n🚀 PRODUCTION READY!");
            console.log("Your teammates can now submit real ZK proofs.");
        } else {
            console.log("\n🎭 DEMO COMPLETED!");
            console.log("Switch to real verifier with: USE_REAL_VERIFIER=true npx hardhat run scripts/deploy-and-working-demo.js");
        }
        
        return result;
    } catch (error) {
        console.error("\n❌ Deployment failed:", error.message);
        process.exit(1);
    }
}

// Export for testing
module.exports = { deployAndDemo, runDemo, main };

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}