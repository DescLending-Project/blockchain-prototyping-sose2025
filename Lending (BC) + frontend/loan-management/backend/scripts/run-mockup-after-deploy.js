const { ethers } = require("hardhat");
require('dotenv').config();

async function runMockupSimulation(contractAddresses = null) {
    console.log("🚀 Starting mockup platform behavior simulation...");

    // Get signers
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const lenderAccount = signers[2]; // Account #2
    const borrowerAccount = signers[3]; // Account #3

    // Fund the lender account from the deployer (for localhost or any network)
    try {
        const tx = await deployer.sendTransaction({
            to: lenderAccount.address,
            value: ethers.parseEther("100") // Fund with 100 ETH
        });
        await tx.wait();
        console.log(`Funded lender account (${lenderAccount.address}) with 100 ETH`);
    } catch (err) {
        console.warn(`Could not fund lender account: ${err.message}`);
    }

    // Fund the borrower account
    try {
        const tx2 = await deployer.sendTransaction({
            to: borrowerAccount.address,
            value: ethers.parseEther("10")
        });
        await tx2.wait();
        console.log(`Funded borrower account (${borrowerAccount.address}) with 10 ETH`);
    } catch (err) {
        console.warn(`Could not fund borrower account: ${err.message}`);
    }

    console.log("👥 Simulation accounts:");
    console.log("   Deployer:", deployer.address);
    console.log("   Lender Account:", lenderAccount.address);
    console.log("   Borrower Account:", borrowerAccount.address);

    // Get contract addresses
    const addresses = contractAddresses || await getDeployedAddresses();

    console.log("📋 Using deployed contracts:");
    console.log("   LiquidityPoolV3:", addresses.liquidityPool);
    console.log("   LendingManager:", addresses.lendingManager);
    console.log("   GlintToken:", addresses.glintToken);

    // Check if LendingManager contract code exists
    const code = await ethers.provider.getCode(addresses.lendingManager);
    if (code === "0x") {
        console.error(`❌ No contract code found at LendingManager address: ${addresses.lendingManager}`);
        process.exit(1);
    } else {
        console.log(`✅ Contract code found at LendingManager address: ${addresses.lendingManager}`);
    }

    // Print ABI version (for debug)
    const LendingManagerArtifact = require('../artifacts/contracts/LendingManager.sol/LendingManager.json');
    console.log(`LendingManager ABI has ${LendingManagerArtifact.abi.length} entries (functions/events)`);

    // Connect to contracts
    const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const GlintToken = await ethers.getContractFactory("GlintToken");

    const liquidityPool = LiquidityPoolV3.attach(addresses.liquidityPool);
    const lendingManager = LendingManager.attach(addresses.lendingManager);
    const glintToken = GlintToken.attach(addresses.glintToken);

    console.log("\n=== SETTING UP MOCKUP SCENARIOS ===");

    // Scenario 1: Lender provides liquidity for 2 months
    console.log("\n--- SCENARIO 1: LENDER PROVIDES LIQUIDITY ---");
    await simulateLenderBehavior(lendingManager, lenderAccount);

    // Scenario 2: Borrower deposits collateral and borrows multiple times
    console.log("\n--- SCENARIO 2: BORROWER ACTIVITY ---");
    await simulateBorrowerBehavior(liquidityPool, glintToken, borrowerAccount, deployer);

    console.log("\n=== MOCKUP SIMULATION COMPLETED ===");
    console.log("✅ The platform now has realistic data for testing the frontend dashboard.");
    console.log("\n📊 Dashboard should now show:");
    console.log("   - Lender: APR, interest earned, transaction history");
    console.log("   - Borrower: Credit score (80), debt, collateral, health ratio");
    console.log("   - Multiple borrow/repay transactions in history");
}

async function simulateLenderBehavior(lendingManager, lenderAccount) {
    console.log("💰 Setting up lender account:", lenderAccount.address);

    // Initial deposit of 50 ETH
    console.log("1. Making initial deposit of 50 ETH...");
    const initialDeposit = ethers.parseEther("50");
    await lendingManager.connect(lenderAccount).depositFunds({ value: initialDeposit });

    // Simulate 2 months of activity (60 days)
    console.log("2. Simulating 2 months of lending activity...");

    for (let day = 1; day <= 60; day++) {
        // Fast forward 1 day
        await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
        await ethers.provider.send("evm_mine");

        // Every 7 days, claim some interest
        if (day % 7 === 0) {
            try {
                await lendingManager.connect(lenderAccount).claimInterest();
                console.log(`   Day ${day}: Interest claimed`);
            } catch (error) {
                // No interest to claim yet
            }
        }

        // Every 15 days, make additional deposits
        if (day % 15 === 0) {
            const additionalDeposit = ethers.parseEther("5");
            await lendingManager.connect(lenderAccount).depositFunds({ value: additionalDeposit });
            console.log(`   Day ${day}: Additional deposit of 5 ETH`);
        }

        // Every 30 days, request a withdrawal
        if (day % 30 === 0) {
            const withdrawalAmount = ethers.parseEther("10");
            await lendingManager.connect(lenderAccount).requestWithdrawal(withdrawalAmount);
            console.log(`   Day ${day}: Withdrawal requested for 10 ETH`);

            // Complete withdrawal after cooldown
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day cooldown
            await ethers.provider.send("evm_mine");
            await lendingManager.connect(lenderAccount).completeWithdrawal();
            console.log(`   Day ${day + 1}: Withdrawal completed`);
        }
    }

    // Get final lender info
    try {
        const lenderInfo = await lendingManager.getLenderInfo(lenderAccount.address);
        console.log("3. Final lender statistics:");
        console.log(`   - Total balance: ${ethers.formatEther(lenderInfo.balance)} ETH`);
        console.log(`   - Pending interest: ${ethers.formatEther(lenderInfo.pendingInterest)} ETH`);
        console.log(`   - Earned interest: ${ethers.formatEther(lenderInfo.earnedInterest)} ETH`);
    } catch (err) {
        console.error("❌ Error calling getLenderInfo:", err);
        // Print debug info
        const code = await lendingManager.provider.getCode(lendingManager.target);
        console.error(`Contract code at LendingManager address: ${code}`);
        throw err;
    }
}

async function simulateBorrowerBehavior(liquidityPool, glintToken, borrowerAccount, deployer) {
    console.log("🏦 Setting up borrower account:", borrowerAccount.address);

    // Set credit score to 80
    console.log("1. Setting credit score to 80...");
    await liquidityPool.connect(deployer).setCreditScore(borrowerAccount.address, 80);

    // Transfer GLINT tokens to borrower for collateral
    console.log("2. Transferring GLINT tokens for collateral...");
    const glintAmount = ethers.parseEther("1000"); // 1000 GLINT tokens
    await glintToken.connect(deployer).transfer(borrowerAccount.address, glintAmount);

    // Approve GLINT tokens for the liquidity pool
    await glintToken.connect(borrowerAccount).approve(liquidityPool.target, glintAmount);

    // Deposit GLINT as collateral
    console.log("3. Depositing GLINT as collateral...");
    await liquidityPool.connect(borrowerAccount).depositCollateral(glintToken.target, glintAmount);

    // Simulate multiple borrow and repay cycles over 2 months
    console.log("4. Simulating 2 months of borrowing activity...");

    let totalBorrowed = ethers.parseEther("0");
    let totalRepaid = ethers.parseEther("0");

    for (let week = 1; week <= 8; week++) {
        // Fast forward 1 week
        await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 1 week
        await ethers.provider.send("evm_mine");

        // Get current debt
        const currentDebt = await liquidityPool.userDebt(borrowerAccount.address);

        if (currentDebt === 0n) {
            // No current debt, can borrow
            const borrowAmount = ethers.parseEther("2"); // Borrow 2 ETH
            await liquidityPool.connect(borrowerAccount).borrow(borrowAmount);
            totalBorrowed += borrowAmount;
            console.log(`   Week ${week}: Borrowed ${ethers.formatEther(borrowAmount)} ETH`);
        } else {
            // Has debt, repay some or all
            const repayAmount = ethers.parseEther("1.5");
            const actualRepay = currentDebt < repayAmount ? currentDebt : repayAmount;
            if (actualRepay > 0n) {
                await liquidityPool.connect(borrowerAccount).repay({ value: actualRepay });
                totalRepaid += actualRepay;
                console.log(`   Week ${week}: Repaid ${ethers.formatEther(actualRepay)} ETH`);
            }
        }

        // Every 2 weeks, add more collateral
        if (week % 2 === 0) {
            const additionalGlint = ethers.parseEther("200");
            await glintToken.connect(deployer).transfer(borrowerAccount.address, additionalGlint);
            await glintToken.connect(borrowerAccount).approve(liquidityPool.target, additionalGlint);
            await liquidityPool.connect(borrowerAccount).depositCollateral(glintToken.target, additionalGlint);
            console.log(`   Week ${week}: Added ${ethers.formatEther(additionalGlint)} GLINT collateral`);
        }
    }

    // Get final borrower statistics
    console.log("5. Final borrower statistics:");
    const finalDebt = await liquidityPool.userDebt(borrowerAccount.address);
    const creditScore = await liquidityPool.getCreditScore(borrowerAccount.address);
    const collateralValue = await liquidityPool.getTotalCollateralValue(borrowerAccount.address);
    const [isHealthy, healthRatio] = await liquidityPool.checkCollateralization(borrowerAccount.address);

    console.log(`   - Current debt: ${ethers.formatEther(finalDebt)} ETH`);
    console.log(`   - Credit score: ${creditScore}`);
    console.log(`   - Collateral value: ${ethers.formatEther(collateralValue)} USD`);
    console.log(`   - Health ratio: ${healthRatio}%`);
    console.log(`   - Position healthy: ${isHealthy}`);
    console.log(`   - Total borrowed: ${ethers.formatEther(totalBorrowed)} ETH`);
    console.log(`   - Total repaid: ${ethers.formatEther(totalRepaid)} ETH`);
}

// Helper function to get deployed contract addresses
async function getDeployedAddresses() {
    // This function should be called after deployAll.js has run
    // For now, we'll use a simple approach - you can modify this based on your deployment output

    // Try to read from a deployment summary file or use environment variables
    const addresses = {
        liquidityPool: process.env.LIQUIDITY_POOL_ADDRESS,
        lendingManager: process.env.LENDING_MANAGER_ADDRESS,
        glintToken: process.env.GLINT_TOKEN_ADDRESS
    };

    // If environment variables are not set, try to read from deployment log
    if (!addresses.liquidityPool) {
        try {
            const fs = require('fs');
            const path = require('path');
            const logPath = path.join(__dirname, '../deploy-debug.log');

            if (fs.existsSync(logPath)) {
                const logContent = fs.readFileSync(logPath, 'utf8');

                const liquidityPoolMatch = logContent.match(/LiquidityPoolV3 deployed to: (0x[a-fA-F0-9]{40})/);
                const lendingManagerMatch = logContent.match(/LendingManager deployed to: (0x[a-fA-F0-9]{40})/);
                const glintTokenMatch = logContent.match(/GlintToken deployed to: (0x[a-fA-F0-9]{40})/);

                if (liquidityPoolMatch) addresses.liquidityPool = liquidityPoolMatch[1];
                if (lendingManagerMatch) addresses.lendingManager = lendingManagerMatch[1];
                if (glintTokenMatch) addresses.glintToken = glintTokenMatch[1];
            }
        } catch (error) {
            console.log("Could not read deployment addresses from log:", error.message);
        }
    }

    // Validate addresses
    if (!addresses.liquidityPool || !addresses.lendingManager || !addresses.glintToken) {
        console.error("❌ Could not find deployed contract addresses.");
        console.error("Please ensure deployAll.js has been run successfully.");
        console.error("You can also set the following environment variables:");
        console.error("  LIQUIDITY_POOL_ADDRESS");
        console.error("  LENDING_MANAGER_ADDRESS");
        console.error("  GLINT_TOKEN_ADDRESS");
        process.exit(1);
    }

    return addresses;
}

// Export the function for use in other scripts
module.exports = { runMockupSimulation };

// If this script is run directly, execute the main function
if (require.main === module) {
    runMockupSimulation()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Error in mockup simulation:", error);
            process.exit(1);
        });
}