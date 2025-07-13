const { ethers } = require("hardhat");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Starting mockup platform behavior simulation...");

    // Get signers
    const [deployer] = await ethers.getSigners();

    // Get contract addresses from deployment
    const addresses = await getContractAddresses();

    if (!addresses.liquidityPool || addresses.liquidityPool === "0x0000000000000000000000000000000000000000") {
        console.error("❌ Could not find deployed contract addresses. Please run deployAll.js first.");
        process.exit(1);
    }

    console.log("📋 Found deployed contracts:");
    console.log("   LiquidityPool:", addresses.liquidityPool);
    console.log("   LendingManager:", addresses.lendingManager);
    console.log("   GlintToken:", addresses.glintToken);

    // Create additional accounts for simulation
    const lenderAccount = new ethers.Wallet(process.env.PRIVATE_KEY || "0x1234567890123456789012345678901234567890123456789012345678901234", ethers.provider);
    const borrowerAccount = new ethers.Wallet("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd", ethers.provider);

    // Fund the borrower account
    await deployer.sendTransaction({
        to: borrowerAccount.address,
        value: ethers.parseEther("10")
    });

    console.log("\n👥 Simulation accounts:");
    console.log("   Deployer:", deployer.address);
    console.log("   Lender Account:", lenderAccount.address);
    console.log("   Borrower Account:", borrowerAccount.address);

    // Connect to contracts
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const GlintToken = await ethers.getContractFactory("GlintToken");

    const liquidityPool = LiquidityPool.attach(addresses.liquidityPool);
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
            await lendingManager.connect(lenderAccount).completeWithdrawal();
            console.log(`   Day ${day + 1}: Withdrawal completed`);
        }
    }

    // Get final lender info
    const lenderInfo = await lendingManager.getLenderInfo(lenderAccount.address);
    console.log("3. Final lender statistics:");
    console.log(`   - Total balance: ${ethers.formatEther(lenderInfo.balance)} ETH`);
    console.log(`   - Pending interest: ${ethers.formatEther(lenderInfo.pendingInterest)} ETH`);
    console.log(`   - Earned interest: ${ethers.formatEther(lenderInfo.earnedInterest)} ETH`);
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
            const repayAmount = ethers.parseEther("1.5"); // Repay 1.5 ETH
            await liquidityPool.connect(borrowerAccount).repay({ value: repayAmount });
            totalRepaid += repayAmount;
            console.log(`   Week ${week}: Repaid ${ethers.formatEther(repayAmount)} ETH`);
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

// Helper function to get contract addresses from deployment artifacts
async function getContractAddresses() {
    try {
        // Check if there's a deployment log file
        const logPath = path.join(__dirname, '../deploy-debug.log');
        if (fs.existsSync(logPath)) {
            const logContent = fs.readFileSync(logPath, 'utf8');

            // Extract addresses from log
            const liquidityPoolMatch = logContent.match(/LiquidityPool deployed to: (0x[a-fA-F0-9]{40})/);
            const lendingManagerMatch = logContent.match(/LendingManager deployed to: (0x[a-fA-F0-9]{40})/);
            const glintTokenMatch = logContent.match(/GlintToken deployed to: (0x[a-fA-F0-9]{40})/);

            if (liquidityPoolMatch && lendingManagerMatch && glintTokenMatch) {
                return {
                    liquidityPool: liquidityPoolMatch[1],
                    lendingManager: lendingManagerMatch[1],
                    glintToken: glintTokenMatch[1]
                };
            }
        }

        // Try reading from .openzeppelin/unknown-*.json files
        const openzeppelinDir = path.join(__dirname, '../.openzeppelin');
        if (fs.existsSync(openzeppelinDir)) {
            const files = fs.readdirSync(openzeppelinDir);
            const networkFile = files.find(f => f.startsWith('unknown-') && f.endsWith('.json'));

            if (networkFile) {
                const networkPath = path.join(openzeppelinDir, networkFile);
                const networkData = JSON.parse(fs.readFileSync(networkPath, 'utf8'));

                // Extract addresses from network data
                const addresses = {};
                for (const [name, info] of Object.entries(networkData.proxies || {})) {
                    if (name.includes('LiquidityPool')) {
                        addresses.liquidityPool = info.address;
                    }
                }

                if (addresses.liquidityPool) {
                    // For now, return what we have and log the missing ones
                    console.log("⚠️  Found LiquidityPool address from OpenZeppelin artifacts");
                    console.log("⚠️  You may need to manually set LendingManager and GlintToken addresses");
                    return {
                        liquidityPool: addresses.liquidityPool,
                        lendingManager: "0x0000000000000000000000000000000000000000",
                        glintToken: "0x0000000000000000000000000000000000000000"
                    };
                }
            }
        }

    } catch (error) {
        console.log("Could not read deployment addresses:", error.message);
    }

    // Return placeholder addresses
    return {
        liquidityPool: "0x0000000000000000000000000000000000000000",
        lendingManager: "0x0000000000000000000000000000000000000000",
        glintToken: "0x0000000000000000000000000000000000000000"
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Error in mockup simulation:", error);
        process.exit(1);
    }); 