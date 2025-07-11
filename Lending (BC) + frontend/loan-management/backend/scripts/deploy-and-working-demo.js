const { ethers } = require("hardhat");

async function deployAndDemo() {
    console.log("🚀 Complete ZK Lending System Deployment + Demo");
    
    const [deployer, user] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("User:", user.address);
    
    // Deploy all contracts first
    console.log("\n📋 Deploying contracts...");
    
    const MockVerifierFactory = await ethers.getContractFactory("MockRiscZeroVerifier");
    const mockVerifier = await MockVerifierFactory.deploy();
    await mockVerifier.waitForDeployment();
    
    const SimpleRISC0TestFactory = await ethers.getContractFactory("SimpleRISC0Test");
    const risc0Test = await SimpleRISC0TestFactory.deploy(await mockVerifier.getAddress());
    await risc0Test.waitForDeployment();
    
    const GlintTokenFactory = await ethers.getContractFactory("GlintToken");
    const glintToken = await GlintTokenFactory.deploy(ethers.parseUnits("1000000", 18));
    await glintToken.waitForDeployment();
    
    const MockPriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
    const glintPriceFeed = await MockPriceFeedFactory.deploy(ethers.parseUnits("1.50", 8), 8);
    await glintPriceFeed.waitForDeployment();
    
    const StablecoinManagerFactory = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManagerFactory.deploy(deployer.address);
    await stablecoinManager.waitForDeployment();
    
    const LendingManagerFactory = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManagerFactory.deploy(deployer.address, ethers.ZeroAddress);
    await lendingManager.waitForDeployment();
    
    const LiquidityPoolV3Factory = await ethers.getContractFactory("LiquidityPoolV3");
    const liquidityPool = await LiquidityPoolV3Factory.deploy();
    await liquidityPool.waitForDeployment();
    
    await liquidityPool.initialize(
        deployer.address,
        await stablecoinManager.getAddress(),
        await lendingManager.getAddress(),
        ethers.ZeroAddress
    );
    
    const IntegratedCreditSystemFactory = await ethers.getContractFactory("IntegratedCreditSystem");
    const creditSystem = await IntegratedCreditSystemFactory.deploy(
        await risc0Test.getAddress(),
        await liquidityPool.getAddress()
    );
    await creditSystem.waitForDeployment();
    
    await liquidityPool.setCreditSystem(await creditSystem.getAddress());
    await liquidityPool.setLendingManager(await lendingManager.getAddress());
    
    // Setup
    await risc0Test.setDemoMode(true);
    await deployer.sendTransaction({ to: await liquidityPool.getAddress(), value: ethers.parseEther("100") });
    await liquidityPool.setAllowedCollateral(await glintToken.getAddress(), true);
    await liquidityPool.setPriceFeed(await glintToken.getAddress(), await glintPriceFeed.getAddress());
    await glintToken.transfer(user.address, ethers.parseUnits("10000", 18));
    
    console.log("✅ All contracts deployed and configured");
    
    // run the working demo
    console.log("\n🎯 Running working demo...");
    
    const collateralAmount = ethers.parseUnits("2000", 18);
    await glintToken.connect(user).approve(await liquidityPool.getAddress(), collateralAmount);
    await liquidityPool.connect(user).depositCollateral(await glintToken.getAddress(), collateralAmount);
    console.log("✅ Deposited collateral");
    
    // Generate proofs (using DemoTester logic inline)
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
    
    // Create mock seals
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
    
    // submit proofs directly from user
    await creditSystem.connect(user).submitAccountProof(accountSeal, accountJournal);
    await creditSystem.connect(user).submitTradFiProof(tradfiSeal, tradfiJournal);
    await creditSystem.connect(user).submitNestingProof(nestingSeal, nestingJournal);
    
    console.log("✅ All proofs submitted");
    
    // Check eligibility
    const profile = await creditSystem.getUserCreditProfile(user.address);
    console.log("Final credit score:", profile[3].toString());
    console.log("Eligible to borrow:", profile[4]);
    
    // Attempt borrowing
    const borrowAmount = ethers.parseEther("0.5");
    await liquidityPool.connect(user).borrow(borrowAmount);
    
    const debt = await liquidityPool.userDebt(user.address);
    console.log("✅ Borrowed successfully! Debt:", ethers.formatEther(debt), "ETH");
    
    console.log("Success");
    console.log("ZK-powered lending system working end-to-end");
}

deployAndDemo().catch(console.error);