const { ethers, upgrades } = require("hardhat");



// CREATED THIS TO FIND OUT WHY MY COLLATERAL DEPOSIT WAS FAILING ON THE FRONTEND (SOLVED)

async function main() {
    console.log("🚀 Starting Credit Score Flow Test...\n");

    // Get signers
    const [deployer, user1, user2] = await ethers.getSigners();
    console.log("📋 Test accounts:");
    console.log("  Deployer:", deployer.address);
    console.log("  User1:", user1.address);
    console.log("  User2:", user2.address);
    console.log("");

    // ========================================
    // 1. DEPLOY MOCK CONTRACTS
    // ========================================
    console.log("📦 Deploying mock contracts...");

    // Deploy GlintToken (for collateral)
    const GlintToken = await ethers.getContractFactory("GlintToken");
    const initialSupply = ethers.parseEther("1000000"); // 1M GLINT tokens
    const glintToken = await GlintToken.deploy(initialSupply);
    await glintToken.waitForDeployment();
    console.log("  Glint Token (GLINT):", await glintToken.getAddress());

    // Deploy Mock Chainlink Price Feed
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const priceFeed = await MockPriceFeed.deploy(100000000, 8); // $1.00 with 8 decimals (price first, decimals second)
    await priceFeed.waitForDeployment();
    console.log("  Mock Price Feed:", await priceFeed.getAddress());

    // Deploy Mock Credit Score Contract (RISC0)
    const MockCreditScore = await ethers.getContractFactory("MockCreditScore");
    const creditScoreContract = await MockCreditScore.deploy();
    await creditScoreContract.waitForDeployment();
    console.log("  Mock Credit Score:", await creditScoreContract.getAddress());

    // ========================================
    // 2. DEPLOY CORE CONTRACTS
    // ========================================
    console.log("\n📦 Deploying core contracts...");

    // Deploy StablecoinManager
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(deployer.address);
    await stablecoinManager.waitForDeployment();
    console.log("  StablecoinManager:", await stablecoinManager.getAddress());

    // Deploy InterestRateModel
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy(
        await priceFeed.getAddress(), // _ethUsdOracle (using our mock price feed)
        deployer.address,             // _timelock
        ethers.parseUnits("2", 16),   // _baseRate (2% APY as 0.02e18)
        ethers.parseUnits("80", 16),  // _kink (80% utilization as 0.8e18)
        ethers.parseUnits("5", 16),   // _slope1 (5% slope before kink as 0.05e18)
        ethers.parseUnits("100", 16), // _slope2 (100% slope after kink as 1.0e18)
        ethers.parseUnits("10", 16),  // _reserveFactor (10% as 0.1e18)
        ethers.parseUnits("150", 16), // _maxBorrowRate (150% max rate as 1.5e18)
        ethers.parseUnits("50", 16),  // _maxRateChange (50% max change as 0.5e18)
        ethers.parseUnits("5", 16),   // _ethPriceRiskPremium (5% premium as 0.05e18)
        ethers.parseUnits("10", 16),  // _ethVolatilityThreshold (10% threshold as 0.1e18)
        3600                          // _oracleStalenessWindow (1 hour in seconds)
    );
    await interestRateModel.waitForDeployment();
    console.log("  InterestRateModel:", await interestRateModel.getAddress());

    // Deploy LiquidityPool (upgradeable) first
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        deployer.address, // timelock
        await stablecoinManager.getAddress(),
        ethers.ZeroAddress, // placeholder for lendingManager - will be set later
        await interestRateModel.getAddress()
    ]);
    await liquidityPool.waitForDeployment();
    console.log("  LiquidityPool:", await liquidityPool.getAddress());

    // Deploy LendingManager with LiquidityPool address
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(
        await liquidityPool.getAddress(),
        deployer.address
    );
    await lendingManager.waitForDeployment();
    console.log("  LendingManager:", await lendingManager.getAddress());

    // Set the LendingManager address in LiquidityPool
    await liquidityPool.setLendingManager(await lendingManager.getAddress());
    console.log("  ✅ LendingManager address set in LiquidityPool");

    // ========================================
    // 3. SETUP CONTRACTS
    // ========================================
    console.log("\n⚙️  Setting up contracts...");

    // Setup Credit Score Contract in LiquidityPool
    await liquidityPool.setCreditScoreContract(await creditScoreContract.getAddress());
    console.log("  ✅ Credit score contract set");

    // Setup collateral token
    await liquidityPool.setAllowedCollateral(await glintToken.getAddress(), true);
    console.log("  ✅ Glint token allowed as collateral");

    // Setup price feed
    await liquidityPool.setPriceFeed(await glintToken.getAddress(), await priceFeed.getAddress());
    console.log("  ✅ Price feed set for Glint token");

    // Add some ETH to the pool for lending
    await deployer.sendTransaction({
        to: await liquidityPool.getAddress(),
        value: ethers.parseEther("100.0")
    });
    console.log("  ✅ Added 100 ETH to liquidity pool");

    // ========================================
    // 4. SETUP MOCK DATA
    // ========================================
    console.log("\n📊 Setting up mock data...");

    // Transfer tokens to users (deployer has all tokens from constructor)
    await glintToken.transfer(user1.address, ethers.parseEther("10000")); // 10,000 GLINT
    await glintToken.transfer(user2.address, ethers.parseEther("5000"));  // 5,000 GLINT
    console.log("  ✅ Transferred GLINT tokens to users");

    // Set credit scores in mock contract
    await creditScoreContract.setScore(user1.address, 750, true); // Good credit (FICO 750)
    await creditScoreContract.setScore(user2.address, 650, true); // Fair credit (FICO 650)
    console.log("  ✅ Set RISC0 credit scores:");
    console.log("    User1: FICO 750 (Contract score: ~82)");
    console.log("    User2: FICO 650 (Contract score: ~64)");

    // ========================================
    // 5. TEST USER 1 FLOW (HIGH CREDIT SCORE)
    // ========================================
    console.log("\n🧪 Testing User1 Flow (High Credit Score)...");

    // Check User1's credit score
    const user1Score = await liquidityPool.getCreditScore(user1.address);
    const user1Tier = await liquidityPool.getRiskTier(user1.address);
    console.log(`  📊 User1 Credit Score: ${user1Score} (Tier: ${user1Tier})`);

    // Get borrow terms
    const [collateralRatio, interestModifier, maxLoan] = await liquidityPool.getBorrowTerms(user1.address);
    console.log(`  📋 Borrow Terms: ${collateralRatio}% collateral, ${interestModifier}% rate modifier, max ${ethers.formatEther(maxLoan)} ETH`);

    // User1 approves and deposits collateral
    await glintToken.connect(user1).approve(await liquidityPool.getAddress(), ethers.parseEther("5000"));
    await liquidityPool.connect(user1).depositCollateral(await glintToken.getAddress(), ethers.parseEther("5000"));
    console.log("  ✅ User1 deposited 5,000 GLINT as collateral");

    // Check collateral value
    const collateralValue = await liquidityPool.getTotalCollateralValue(user1.address);
    console.log(`  💰 User1 Collateral Value: $${ethers.formatEther(collateralValue)}`);

    // Calculate max borrowable amount
    const maxBorrowable = (collateralValue * 100n) / BigInt(collateralRatio);
    console.log(`  📈 Max Borrowable: ${ethers.formatEther(maxBorrowable)} ETH`);

    // User1 borrows (simplified - no nullifier needed)
    const borrowAmount = ethers.parseEther("2.0"); // Borrow 2 ETH
    
    const balanceBefore = await ethers.provider.getBalance(user1.address);
    await liquidityPool.connect(user1).borrow(borrowAmount);
    const balanceAfter = await ethers.provider.getBalance(user1.address);
    
    console.log(`  ✅ User1 borrowed ${ethers.formatEther(borrowAmount)} ETH`);
    console.log(`  💎 ETH received: ${ethers.formatEther(balanceAfter - balanceBefore)} ETH`);

    // Check loan details
    const loan1 = await liquidityPool.getLoan(user1.address);
    console.log(`  📋 Loan Details: Principal: ${ethers.formatEther(loan1.principal)} ETH, Rate: ${loan1.interestRate}`);

    // ========================================
    // 6. TEST USER 2 FLOW (MEDIUM CREDIT SCORE)
    // ========================================
    console.log("\n🧪 Testing User2 Flow (Medium Credit Score)...");

    // Check User2's credit score
    const user2Score = await liquidityPool.getCreditScore(user2.address);
    const user2Tier = await liquidityPool.getRiskTier(user2.address);
    console.log(`  📊 User2 Credit Score: ${user2Score} (Tier: ${user2Tier})`);

    // Get borrow terms
    const [collateralRatio2, interestModifier2, maxLoan2] = await liquidityPool.getBorrowTerms(user2.address);
    console.log(`  📋 Borrow Terms: ${collateralRatio2}% collateral, ${interestModifier2}% rate modifier, max ${ethers.formatEther(maxLoan2)} ETH`);

    // User2 approves and deposits collateral
    await glintToken.connect(user2).approve(await liquidityPool.getAddress(), ethers.parseEther("3000"));
    await liquidityPool.connect(user2).depositCollateral(await glintToken.getAddress(), ethers.parseEther("3000"));
    console.log("  ✅ User2 deposited 3,000 GLINT as collateral");

    // User2 borrows
    const borrowAmount2 = ethers.parseEther("1.5"); // Borrow 1.5 ETH
    
    const balance2Before = await ethers.provider.getBalance(user2.address);
    await liquidityPool.connect(user2).borrow(borrowAmount2);
    const balance2After = await ethers.provider.getBalance(user2.address);
    
    console.log(`  ✅ User2 borrowed ${ethers.formatEther(borrowAmount2)} ETH`);
    console.log(`  💎 ETH received: ${ethers.formatEther(balance2After - balance2Before)} ETH`);

    // ========================================
    // 7. TEST REPAYMENT
    // ========================================
    console.log("\n💰 Testing Repayment Flow...");

    // User1 repays part of the loan
    const repayAmount = ethers.parseEther("1.0");
    await liquidityPool.connect(user1).repay({ value: repayAmount });
    console.log(`  ✅ User1 repaid ${ethers.formatEther(repayAmount)} ETH`);

    // Check updated debt
    const debt1After = await liquidityPool.userDebt(user1.address);
    console.log(`  📊 User1 remaining debt: ${ethers.formatEther(debt1After)} ETH`);

    // ========================================
    // 8. SUMMARY
    // ========================================
    console.log("\n📊 Final Summary:");
    console.log("================");
    
    const poolBalance = await ethers.provider.getBalance(await liquidityPool.getAddress());
    console.log(`💎 Pool Balance: ${ethers.formatEther(poolBalance)} ETH`);
    
    const user1Debt = await liquidityPool.userDebt(user1.address);
    const user2Debt = await liquidityPool.userDebt(user2.address);
    console.log(`📊 User1 Debt: ${ethers.formatEther(user1Debt)} ETH`);
    console.log(`📊 User2 Debt: ${ethers.formatEther(user2Debt)} ETH`);
    
    const user1Collateral = await liquidityPool.getCollateral(user1.address, await glintToken.getAddress());
    const user2Collateral = await liquidityPool.getCollateral(user2.address, await glintToken.getAddress());
    console.log(`💰 User1 Collateral: ${ethers.formatEther(user1Collateral)} GLINT`);
    console.log(`💰 User2 Collateral: ${ethers.formatEther(user2Collateral)} GLINT`);

    console.log("\n✅ Credit Score Flow Test Completed Successfully!");
    console.log("\nKey Features Tested:");
    console.log("  ✅ RISC0 Credit Score Integration");
    console.log("  ✅ Risk-based Tier System");
    console.log("  ✅ Collateral Management");
    console.log("  ✅ Dynamic Interest Rates");
    console.log("  ✅ Simplified Borrowing & Repayment");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
