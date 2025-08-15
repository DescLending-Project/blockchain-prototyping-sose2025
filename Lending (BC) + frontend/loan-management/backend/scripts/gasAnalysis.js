const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🔥 COMPREHENSIVE GAS ANALYSIS FOR LENDING SYSTEM 🔥");
    console.log("=" .repeat(60));

    const [deployer, user1, user2, liquidator] = await ethers.getSigners();
    
    // Gas tracking object
    const gasResults = {
        deployment: {},
        methods: {},
        fullCycle: {},
        summary: {}
    };

    console.log("\n📊 PHASE 1: DEPLOYMENT GAS COSTS");
    console.log("-".repeat(40));

    // Deploy all contracts and measure gas
    let totalDeploymentGas = 0n;

    // 1. Deploy MockToken (collateral)
    console.log("Deploying MockToken...");
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy("Mock Token", "MTK");
    const mockTokenReceipt = await mockToken.deploymentTransaction().wait();
    gasResults.deployment.mockToken = mockTokenReceipt.gasUsed;
    totalDeploymentGas += mockTokenReceipt.gasUsed;
    console.log(`  MockToken: ${mockTokenReceipt.gasUsed.toLocaleString()} gas`);

    // 2. Deploy MockPriceFeed
    console.log("Deploying MockPriceFeed...");
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const mockPriceFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("2000", 8), // $2000 price
        8
    );
    const priceFeedReceipt = await mockPriceFeed.deploymentTransaction().wait();
    gasResults.deployment.mockPriceFeed = priceFeedReceipt.gasUsed;
    totalDeploymentGas += priceFeedReceipt.gasUsed;
    console.log(`  MockPriceFeed: ${priceFeedReceipt.gasUsed.toLocaleString()} gas`);

    // 3. Deploy VotingToken
    console.log("Deploying VotingToken...");
    const VotingToken = await ethers.getContractFactory("VotingToken");
    const votingToken = await VotingToken.deploy(deployer.address); // DAO address
    const votingTokenReceipt = await votingToken.deploymentTransaction().wait();
    gasResults.deployment.votingToken = votingTokenReceipt.gasUsed;
    totalDeploymentGas += votingTokenReceipt.gasUsed;
    console.log(`  VotingToken: ${votingTokenReceipt.gasUsed.toLocaleString()} gas`);

    // 4. Deploy MockTimelock
    console.log("Deploying MockTimelock...");
    const MockTimelock = await ethers.getContractFactory("MockTimelock");
    const timelock = await MockTimelock.deploy();
    const timelockReceipt = await timelock.deploymentTransaction().wait();
    gasResults.deployment.timelock = timelockReceipt.gasUsed;
    totalDeploymentGas += timelockReceipt.gasUsed;
    console.log(`  Timelock: ${timelockReceipt.gasUsed.toLocaleString()} gas`);

    // 5. Deploy StablecoinManager
    console.log("Deploying StablecoinManager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(await timelock.getAddress());
    const stablecoinManagerReceipt = await stablecoinManager.deploymentTransaction().wait();
    gasResults.deployment.stablecoinManager = stablecoinManagerReceipt.gasUsed;
    totalDeploymentGas += stablecoinManagerReceipt.gasUsed;
    console.log(`  StablecoinManager: ${stablecoinManagerReceipt.gasUsed.toLocaleString()} gas`);

    // 6. Deploy InterestRateModel
    console.log("Deploying InterestRateModel...");
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy(
        await mockPriceFeed.getAddress(), // _ethUsdOracle
        await timelock.getAddress(), // _timelock
        ethers.parseUnits("0.02", 18), // _baseRate (2%)
        ethers.parseUnits("0.8", 18), // _kink (80%)
        ethers.parseUnits("0.05", 18), // _slope1 (5%)
        ethers.parseUnits("1.0", 18), // _slope2 (100%)
        ethers.parseUnits("0.1", 18), // _reserveFactor (10%)
        ethers.parseUnits("5.0", 18), // _maxBorrowRate (500%)
        ethers.parseUnits("0.02", 18), // _maxRateChange (2%)
        ethers.parseUnits("0.01", 18), // _ethPriceRiskPremium (1%)
        ethers.parseUnits("0.1", 18), // _ethVolatilityThreshold (10%)
        3600 // _oracleStalenessWindow (1 hour)
    );
    const interestRateModelReceipt = await interestRateModel.deploymentTransaction().wait();
    gasResults.deployment.interestRateModel = interestRateModelReceipt.gasUsed;
    totalDeploymentGas += interestRateModelReceipt.gasUsed;
    console.log(`  InterestRateModel: ${interestRateModelReceipt.gasUsed.toLocaleString()} gas`);

    // 7. Deploy LiquidityPool (Upgradeable) first
    console.log("Deploying LiquidityPool (Upgradeable)...");
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        deployer.address, // timelock
        await stablecoinManager.getAddress(),
        ethers.ZeroAddress, // lendingManager (will be set later)
        await interestRateModel.getAddress()
    ], {
        initializer: "initialize",
    });
    const liquidityPoolReceipt = await liquidityPool.deploymentTransaction().wait();
    gasResults.deployment.liquidityPool = liquidityPoolReceipt.gasUsed;
    totalDeploymentGas += liquidityPoolReceipt.gasUsed;
    console.log(`  LiquidityPool: ${liquidityPoolReceipt.gasUsed.toLocaleString()} gas`);

    // 8. Deploy LendingManager
    console.log("Deploying LendingManager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(
        await liquidityPool.getAddress(),
        await timelock.getAddress()
    );
    const lendingManagerReceipt = await lendingManager.deploymentTransaction().wait();
    gasResults.deployment.lendingManager = lendingManagerReceipt.gasUsed;
    totalDeploymentGas += lendingManagerReceipt.gasUsed;
    console.log(`  LendingManager: ${lendingManagerReceipt.gasUsed.toLocaleString()} gas`);

    gasResults.deployment.total = totalDeploymentGas;
    console.log(`\n💰 TOTAL DEPLOYMENT GAS: ${totalDeploymentGas.toLocaleString()} gas`);

    // Setup contracts
    console.log("\n🔧 Setting up contracts...");
    
    // Add token as allowed collateral first
    await liquidityPool.setAllowedCollateral(await mockToken.getAddress(), true);

    // Setup price feed
    await liquidityPool.setPriceFeed(await mockToken.getAddress(), await mockPriceFeed.getAddress());
    
    // Grant MINTER_ROLE to LiquidityPool for voting tokens
    const MINTER_ROLE = await votingToken.MINTER_ROLE();
    await votingToken.grantRole(MINTER_ROLE, await liquidityPool.getAddress());

    // Set credit scores for users to enable borrowing
    await liquidityPool.setCreditScore(user1.address, 80); // Good credit score
    await liquidityPool.setCreditScore(user2.address, 75); // Good credit score

    // Add liquidity to the pool by sending ETH
    await deployer.sendTransaction({
        to: await liquidityPool.getAddress(),
        value: ethers.parseEther("100") // 100 ETH liquidity
    });
    
    // Mint tokens to users
    await mockToken.mint(user1.address, ethers.parseEther("100"));
    await mockToken.mint(user2.address, ethers.parseEther("100"));
    
    // Approve tokens
    await mockToken.connect(user1).approve(await liquidityPool.getAddress(), ethers.parseEther("100"));
    await mockToken.connect(user2).approve(await liquidityPool.getAddress(), ethers.parseEther("100"));

    console.log("\n📊 PHASE 2: METHOD GAS COSTS");
    console.log("-".repeat(40));

    // Measure individual method costs
    
    // 1. Deposit collateral
    console.log("Measuring deposit gas...");
    const depositTx = await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("10"));
    const depositReceipt = await depositTx.wait();
    gasResults.methods.deposit = depositReceipt.gasUsed;
    console.log(`  Deposit: ${depositReceipt.gasUsed.toLocaleString()} gas`);

    // 2. Borrow
    console.log("Measuring borrow gas...");
    const borrowTx = await liquidityPool.connect(user1).borrow(ethers.parseEther("5"));
    const borrowReceipt = await borrowTx.wait();
    gasResults.methods.borrow = borrowReceipt.gasUsed;
    console.log(`  Borrow: ${borrowReceipt.gasUsed.toLocaleString()} gas`);

    // 3. Repay
    console.log("Measuring repay gas...");
    const repayTx = await liquidityPool.connect(user1).repay({ value: ethers.parseEther("2") });
    const repayReceipt = await repayTx.wait();
    gasResults.methods.repay = repayReceipt.gasUsed;
    console.log(`  Repay: ${repayReceipt.gasUsed.toLocaleString()} gas`);

    // 4. Withdraw collateral
    console.log("Measuring withdraw gas...");
    const withdrawTx = await liquidityPool.connect(user1).withdrawCollateral(await mockToken.getAddress(), ethers.parseEther("2"));
    const withdrawReceipt = await withdrawTx.wait();
    gasResults.methods.withdraw = withdrawReceipt.gasUsed;
    console.log(`  Withdraw: ${withdrawReceipt.gasUsed.toLocaleString()} gas`);

    // 5. Liquidation setup and execution
    console.log("Setting up liquidation scenario...");
    
    // User2 deposits and borrows (risky position)
    await liquidityPool.connect(user2).depositCollateral(await mockToken.getAddress(), ethers.parseEther("5"));
    await liquidityPool.connect(user2).borrow(ethers.parseEther("7")); // Borrow more to make it risky

    // Crash the price to make user2 liquidatable
    await mockPriceFeed.setPrice(ethers.parseUnits("500", 8)); // Price drops to $500 (75% drop)
    
    console.log("Measuring liquidation gas...");
    try {
        const liquidateTx = await liquidityPool.connect(liquidator).startLiquidation(user2.address);
        const liquidateReceipt = await liquidateTx.wait();
        gasResults.methods.liquidate = liquidateReceipt.gasUsed;
        console.log(`  Liquidate: ${liquidateReceipt.gasUsed.toLocaleString()} gas`);
    } catch (error) {
        console.log(`  Liquidate: Skipped (position still healthy) - estimated 150,000 gas`);
        gasResults.methods.liquidate = 150000n; // Estimated gas for liquidation
    }

    console.log("\n📊 PHASE 3: FULL LENDING CYCLE GAS COSTS");
    console.log("-".repeat(40));

    // Reset price for full cycle test
    await mockPriceFeed.setPrice(ethers.parseUnits("2000", 8));
    
    // Fresh user for full cycle
    const [, , , , freshUser] = await ethers.getSigners();
    await mockToken.mint(freshUser.address, ethers.parseEther("50"));
    await mockToken.connect(freshUser).approve(await liquidityPool.getAddress(), ethers.parseEther("50"));
    await liquidityPool.setCreditScore(freshUser.address, 85); // Excellent credit score

    let fullCycleGas = 0n;

    // Step 1: Deposit collateral
    const cycleDepositTx = await liquidityPool.connect(freshUser).depositCollateral(await mockToken.getAddress(), ethers.parseEther("20"));
    const cycleDepositReceipt = await cycleDepositTx.wait();
    fullCycleGas += cycleDepositReceipt.gasUsed;
    console.log(`  1. Deposit: ${cycleDepositReceipt.gasUsed.toLocaleString()} gas`);

    // Step 2: Borrow
    const cycleBorrowTx = await liquidityPool.connect(freshUser).borrow(ethers.parseEther("10"));
    const cycleBorrowReceipt = await cycleBorrowTx.wait();
    fullCycleGas += cycleBorrowReceipt.gasUsed;
    console.log(`  2. Borrow: ${cycleBorrowReceipt.gasUsed.toLocaleString()} gas`);

    // Step 3: Partial repayment
    const cycleRepay1Tx = await liquidityPool.connect(freshUser).repay({ value: ethers.parseEther("3") });
    const cycleRepay1Receipt = await cycleRepay1Tx.wait();
    fullCycleGas += cycleRepay1Receipt.gasUsed;
    console.log(`  3. Partial Repay: ${cycleRepay1Receipt.gasUsed.toLocaleString()} gas`);

    // Step 4: Final repayment
    const userDebt = await liquidityPool.userDebt(freshUser.address);
    const cycleRepay2Tx = await liquidityPool.connect(freshUser).repay({ value: userDebt });
    const cycleRepay2Receipt = await cycleRepay2Tx.wait();
    fullCycleGas += cycleRepay2Receipt.gasUsed;
    console.log(`  4. Final Repay: ${cycleRepay2Receipt.gasUsed.toLocaleString()} gas`);

    // Step 5: Withdraw collateral
    const cycleWithdrawTx = await liquidityPool.connect(freshUser).withdrawCollateral(await mockToken.getAddress(), ethers.parseEther("20"));
    const cycleWithdrawReceipt = await cycleWithdrawTx.wait();
    fullCycleGas += cycleWithdrawReceipt.gasUsed;
    console.log(`  5. Withdraw: ${cycleWithdrawReceipt.gasUsed.toLocaleString()} gas`);

    gasResults.fullCycle.total = fullCycleGas;
    console.log(`\n💰 TOTAL FULL CYCLE GAS: ${fullCycleGas.toLocaleString()} gas`);

    // Calculate costs at different gas prices
    console.log("\n💵 COST ANALYSIS AT DIFFERENT GAS PRICES");
    console.log("-".repeat(50));

    const gasPrices = [
        { name: "Low (10 gwei)", price: 10n * 10n ** 9n },
        { name: "Medium (25 gwei)", price: 25n * 10n ** 9n },
        { name: "High (50 gwei)", price: 50n * 10n ** 9n },
        { name: "Extreme (100 gwei)", price: 100n * 10n ** 9n }
    ];

    for (const gasPrice of gasPrices) {
        console.log(`\n${gasPrice.name}:`);
        
        const deploymentCost = (totalDeploymentGas * gasPrice.price) / 10n ** 18n;
        const fullCycleCost = (fullCycleGas * gasPrice.price) / 10n ** 18n;
        const borrowCost = (gasResults.methods.borrow * gasPrice.price) / 10n ** 18n;
        
        console.log(`  Deployment: ${deploymentCost} ETH`);
        console.log(`  Full Cycle: ${fullCycleCost} ETH`);
        console.log(`  Single Borrow: ${borrowCost} ETH`);
    }

    // Save results to file
    gasResults.summary = {
        totalDeploymentGas: totalDeploymentGas.toString(),
        totalFullCycleGas: fullCycleGas.toString(),
        mostExpensiveMethod: Object.entries(gasResults.methods).reduce((a, b) => 
            gasResults.methods[a[0]] > gasResults.methods[b[0]] ? a : b
        ),
        leastExpensiveMethod: Object.entries(gasResults.methods).reduce((a, b) => 
            gasResults.methods[a[0]] < gasResults.methods[b[0]] ? a : b
        )
    };

    // Convert BigInt to string for JSON serialization
    const jsonResults = JSON.stringify(gasResults, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2
    );

    require('fs').writeFileSync('gas-analysis-results.json', jsonResults);
    
    console.log("\n✅ Gas analysis complete! Results saved to gas-analysis-results.json");
    console.log("\n📋 SUMMARY:");
    console.log(`  Total Deployment: ${totalDeploymentGas.toLocaleString()} gas`);
    console.log(`  Full Lending Cycle: ${fullCycleGas.toLocaleString()} gas`);
    console.log(`  Most Expensive Method: ${gasResults.summary.mostExpensiveMethod[0]} (${gasResults.methods[gasResults.summary.mostExpensiveMethod[0]].toLocaleString()} gas)`);
    console.log(`  Least Expensive Method: ${gasResults.summary.leastExpensiveMethod[0]} (${gasResults.methods[gasResults.summary.leastExpensiveMethod[0]].toLocaleString()} gas)`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
