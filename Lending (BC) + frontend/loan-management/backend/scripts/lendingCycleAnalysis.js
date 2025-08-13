const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🔄 COMPLETE LENDING CYCLE GAS ANALYSIS");
    console.log("=" .repeat(45));

    const [deployer, borrower, lender, liquidator] = await ethers.getSigners();
    
    // Deploy minimal system for testing
    console.log("🚀 Setting up test environment...");
    
    // Deploy contracts (reusing deployment logic)
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy("Test Token", "TEST");

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const mockPriceFeed = await MockPriceFeed.deploy(ethers.parseUnits("2000", 8), 8);
    
    const VotingToken = await ethers.getContractFactory("VotingToken");
    const votingToken = await VotingToken.deploy(deployer.address); // DAO address
    
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy();
    
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy();
    
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy();
    
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        deployer.address,
        await stablecoinManager.getAddress(),
        await lendingManager.getAddress(),
        await interestRateModel.getAddress()
    ], { initializer: "initialize" });

    // Setup
    await liquidityPool.setPriceFeed(await mockToken.getAddress(), await mockPriceFeed.getAddress());
    await liquidityPool.setCollateralFactor(await mockToken.getAddress(), ethers.parseUnits("0.8", 18));
    
    const MINTER_ROLE = await votingToken.MINTER_ROLE();
    await votingToken.grantRole(MINTER_ROLE, await liquidityPool.getAddress());
    
    // Mint tokens
    await mockToken.mint(borrower.address, ethers.parseEther("100"));
    await mockToken.mint(lender.address, ethers.parseEther("100"));
    await mockToken.mint(liquidator.address, ethers.parseEther("100"));
    
    // Approve tokens
    await mockToken.connect(borrower).approve(await liquidityPool.getAddress(), ethers.parseEther("100"));
    await mockToken.connect(lender).approve(await liquidityPool.getAddress(), ethers.parseEther("100"));
    await mockToken.connect(liquidator).approve(await liquidityPool.getAddress(), ethers.parseEther("100"));

    console.log("✅ Environment ready!\n");

    const cycleResults = {
        borrowerJourney: {},
        lenderJourney: {},
        liquidationScenario: {},
        summary: {}
    };

    console.log("👤 BORROWER JOURNEY ANALYSIS");
    console.log("-".repeat(35));

    let borrowerTotalGas = 0n;

    // Borrower Step 1: Deposit Collateral
    console.log("1. Depositing collateral...");
    const depositTx = await liquidityPool.connect(borrower).deposit(
        await mockToken.getAddress(), 
        ethers.parseEther("20")
    );
    const depositReceipt = await depositTx.wait();
    cycleResults.borrowerJourney.deposit = depositReceipt.gasUsed;
    borrowerTotalGas += depositReceipt.gasUsed;
    console.log(`   Gas: ${depositReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Collateral deposited: 20 tokens`);

    // Borrower Step 2: Borrow
    console.log("\n2. Borrowing funds...");
    const borrowTx = await liquidityPool.connect(borrower).borrow(ethers.parseEther("10"));
    const borrowReceipt = await borrowTx.wait();
    cycleResults.borrowerJourney.borrow = borrowReceipt.gasUsed;
    borrowerTotalGas += borrowReceipt.gasUsed;
    console.log(`   Gas: ${borrowReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Amount borrowed: 10 ETH`);

    // Check loan details
    const loanAfterBorrow = await liquidityPool.getLoan(borrower.address);
    console.log(`   Outstanding debt: ${ethers.formatEther(loanAfterBorrow.outstanding)} ETH`);

    // Borrower Step 3: Partial Repayment
    console.log("\n3. Making partial repayment...");
    const partialRepayTx = await liquidityPool.connect(borrower).repay(ethers.parseEther("3"));
    const partialRepayReceipt = await partialRepayTx.wait();
    cycleResults.borrowerJourney.partialRepay = partialRepayReceipt.gasUsed;
    borrowerTotalGas += partialRepayReceipt.gasUsed;
    console.log(`   Gas: ${partialRepayReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Amount repaid: 3 ETH`);

    // Check updated loan
    const loanAfterPartialRepay = await liquidityPool.getLoan(borrower.address);
    console.log(`   Remaining debt: ${ethers.formatEther(loanAfterPartialRepay.outstanding)} ETH`);

    // Borrower Step 4: Full Repayment
    console.log("\n4. Making final repayment...");
    const finalLoan = await liquidityPool.getLoan(borrower.address);
    const finalRepayTx = await liquidityPool.connect(borrower).repay(finalLoan.outstanding);
    const finalRepayReceipt = await finalRepayTx.wait();
    cycleResults.borrowerJourney.finalRepay = finalRepayReceipt.gasUsed;
    borrowerTotalGas += finalRepayReceipt.gasUsed;
    console.log(`   Gas: ${finalRepayReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Amount repaid: ${ethers.formatEther(finalLoan.outstanding)} ETH`);

    // Borrower Step 5: Withdraw Collateral
    console.log("\n5. Withdrawing collateral...");
    const withdrawTx = await liquidityPool.connect(borrower).withdraw(
        await mockToken.getAddress(), 
        ethers.parseEther("20")
    );
    const withdrawReceipt = await withdrawTx.wait();
    cycleResults.borrowerJourney.withdraw = withdrawReceipt.gasUsed;
    borrowerTotalGas += withdrawReceipt.gasUsed;
    console.log(`   Gas: ${withdrawReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Collateral withdrawn: 20 tokens`);

    cycleResults.borrowerJourney.total = borrowerTotalGas;
    console.log(`\n💰 BORROWER TOTAL GAS: ${borrowerTotalGas.toLocaleString()}`);

    console.log("\n🏦 LENDER JOURNEY ANALYSIS");
    console.log("-".repeat(30));

    let lenderTotalGas = 0n;

    // Lender Step 1: Provide Liquidity
    console.log("1. Providing liquidity...");
    const provideLiquidityTx = await liquidityPool.connect(lender).deposit(
        await mockToken.getAddress(), 
        ethers.parseEther("50")
    );
    const provideLiquidityReceipt = await provideLiquidityTx.wait();
    cycleResults.lenderJourney.provideLiquidity = provideLiquidityReceipt.gasUsed;
    lenderTotalGas += provideLiquidityReceipt.gasUsed;
    console.log(`   Gas: ${provideLiquidityReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Liquidity provided: 50 tokens`);

    // Lender Step 2: Withdraw Liquidity (after some time)
    console.log("\n2. Withdrawing liquidity...");
    const withdrawLiquidityTx = await liquidityPool.connect(lender).withdraw(
        await mockToken.getAddress(), 
        ethers.parseEther("25")
    );
    const withdrawLiquidityReceipt = await withdrawLiquidityTx.wait();
    cycleResults.lenderJourney.withdrawLiquidity = withdrawLiquidityReceipt.gasUsed;
    lenderTotalGas += withdrawLiquidityReceipt.gasUsed;
    console.log(`   Gas: ${withdrawLiquidityReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Liquidity withdrawn: 25 tokens`);

    cycleResults.lenderJourney.total = lenderTotalGas;
    console.log(`\n💰 LENDER TOTAL GAS: ${lenderTotalGas.toLocaleString()}`);

    console.log("\n⚡ LIQUIDATION SCENARIO ANALYSIS");
    console.log("-".repeat(35));

    // Setup liquidation scenario
    const [, , , , liquidationBorrower] = await ethers.getSigners();
    await mockToken.mint(liquidationBorrower.address, ethers.parseEther("50"));
    await mockToken.connect(liquidationBorrower).approve(await liquidityPool.getAddress(), ethers.parseEther("50"));

    let liquidationTotalGas = 0n;

    // Step 1: Borrower deposits and borrows (risky position)
    console.log("1. Setting up risky position...");
    const riskDepositTx = await liquidityPool.connect(liquidationBorrower).deposit(
        await mockToken.getAddress(), 
        ethers.parseEther("10")
    );
    const riskDepositReceipt = await riskDepositTx.wait();
    
    const riskBorrowTx = await liquidityPool.connect(liquidationBorrower).borrow(ethers.parseEther("7"));
    const riskBorrowReceipt = await riskBorrowTx.wait();
    
    liquidationTotalGas += riskDepositReceipt.gasUsed + riskBorrowReceipt.gasUsed;
    console.log(`   Setup Gas: ${(riskDepositReceipt.gasUsed + riskBorrowReceipt.gasUsed).toLocaleString()}`);

    // Step 2: Price crash (making position liquidatable)
    console.log("\n2. Price crash occurs...");
    await mockPriceFeed.updateAnswer(ethers.parseUnits("1000", 8)); // 50% price drop
    console.log(`   Price dropped from $2000 to $1000`);

    // Step 3: Liquidation
    console.log("\n3. Executing liquidation...");
    const liquidateTx = await liquidityPool.connect(liquidator).liquidate(
        liquidationBorrower.address, 
        ethers.parseEther("3")
    );
    const liquidateReceipt = await liquidateTx.wait();
    cycleResults.liquidationScenario.liquidate = liquidateReceipt.gasUsed;
    liquidationTotalGas += liquidateReceipt.gasUsed;
    console.log(`   Liquidation Gas: ${liquidateReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Amount liquidated: 3 ETH`);

    cycleResults.liquidationScenario.total = liquidationTotalGas;
    console.log(`\n💰 LIQUIDATION TOTAL GAS: ${liquidationTotalGas.toLocaleString()}`);

    // Summary Analysis
    console.log("\n📊 COMPREHENSIVE SUMMARY");
    console.log("-".repeat(30));

    const totalSystemGas = borrowerTotalGas + lenderTotalGas + liquidationTotalGas;
    
    cycleResults.summary = {
        borrowerTotal: borrowerTotalGas.toString(),
        lenderTotal: lenderTotalGas.toString(),
        liquidationTotal: liquidationTotalGas.toString(),
        grandTotal: totalSystemGas.toString(),
        averagePerOperation: (totalSystemGas / 10n).toString(), // 10 total operations
        mostExpensiveOperation: "TBD",
        leastExpensiveOperation: "TBD"
    };

    // Find most/least expensive operations
    const allOperations = {
        ...cycleResults.borrowerJourney,
        ...cycleResults.lenderJourney,
        ...cycleResults.liquidationScenario
    };
    
    delete allOperations.total; // Remove totals from comparison
    
    const sortedOps = Object.entries(allOperations).sort(([,a], [,b]) => Number(b - a));
    cycleResults.summary.mostExpensiveOperation = `${sortedOps[0][0]}: ${sortedOps[0][1].toLocaleString()} gas`;
    cycleResults.summary.leastExpensiveOperation = `${sortedOps[sortedOps.length-1][0]}: ${sortedOps[sortedOps.length-1][1].toLocaleString()} gas`;

    console.log(`Borrower Journey: ${borrowerTotalGas.toLocaleString()} gas`);
    console.log(`Lender Journey: ${lenderTotalGas.toLocaleString()} gas`);
    console.log(`Liquidation Scenario: ${liquidationTotalGas.toLocaleString()} gas`);
    console.log(`TOTAL SYSTEM GAS: ${totalSystemGas.toLocaleString()} gas`);
    console.log(`Average per operation: ${(totalSystemGas / 10n).toLocaleString()} gas`);
    console.log(`Most expensive: ${cycleResults.summary.mostExpensiveOperation}`);
    console.log(`Least expensive: ${cycleResults.summary.leastExpensiveOperation}`);

    console.log("\n💵 COST BREAKDOWN AT 25 GWEI");
    console.log("-".repeat(30));
    const gasPrice = 25n * 10n ** 9n; // 25 gwei
    
    const borrowerCost = (borrowerTotalGas * gasPrice) / 10n ** 18n;
    const lenderCost = (lenderTotalGas * gasPrice) / 10n ** 18n;
    const liquidationCost = (liquidationTotalGas * gasPrice) / 10n ** 18n;
    
    console.log(`Borrower Journey: ${ethers.formatEther(borrowerTotalGas * gasPrice)} ETH`);
    console.log(`Lender Journey: ${ethers.formatEther(lenderTotalGas * gasPrice)} ETH`);
    console.log(`Liquidation: ${ethers.formatEther(liquidationTotalGas * gasPrice)} ETH`);

    // Save results
    const jsonResults = JSON.stringify(cycleResults, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2
    );

    require('fs').writeFileSync('lending-cycle-analysis.json', jsonResults);
    
    console.log("\n✅ Lending cycle analysis complete!");
    console.log("📄 Results saved to lending-cycle-analysis.json");

    return cycleResults;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
