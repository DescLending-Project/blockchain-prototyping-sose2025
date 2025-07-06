const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("Testing timestamp fix...");

    // Get signers
    const [deployer] = await ethers.getSigners();

    // Create lender account
    const lenderAccount = new ethers.Wallet(process.env.PRIVATE_KEY || "0x1234567890123456789012345678901234567890123456789012345678901234", ethers.provider);

    // Get contract addresses from deployment
    const addresses = await getContractAddresses();

    if (!addresses.lendingManager) {
        console.error("❌ Could not find LendingManager address");
        process.exit(1);
    }

    // Connect to LendingManager
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = LendingManager.attach(addresses.lendingManager);

    console.log("📋 Testing with contracts:");
    console.log("   LendingManager:", addresses.lendingManager);
    console.log("   Lender Account:", lenderAccount.address);

    // Fund lender account
    await deployer.sendTransaction({
        to: lenderAccount.address,
        value: ethers.parseEther("10")
    });

    // Make a deposit
    console.log("\n💰 Making deposit...");
    await lendingManager.connect(lenderAccount).depositFunds({ value: ethers.parseEther("5") });

    // Get lender info
    console.log("\n📊 Getting lender info...");
    const lenderInfo = await lendingManager.getLenderInfo(lenderAccount.address);

    console.log("Lender Info:");
    console.log("   Balance:", ethers.formatEther(lenderInfo.balance), "ETH");
    console.log("   Pending Interest:", ethers.formatEther(lenderInfo.pendingInterest), "ETH");
    console.log("   Earned Interest:", ethers.formatEther(lenderInfo.earnedInterest), "ETH");

    // Test timestamp formatting
    const nextInterestUpdate = Number(lenderInfo.nextInterestUpdate);
    const penaltyFreeWithdrawalTime = Number(lenderInfo.penaltyFreeWithdrawalTime);
    const lastDistributionTime = Number(lenderInfo.lastDistributionTime);

    console.log("\n⏰ Timestamp Analysis:");
    console.log("   Next Interest Update:", nextInterestUpdate);
    console.log("   Next Interest Update (formatted):", new Date(nextInterestUpdate * 1000).toLocaleString());
    console.log("   Penalty Free Withdrawal Time:", penaltyFreeWithdrawalTime);
    console.log("   Penalty Free Withdrawal Time (formatted):", new Date(penaltyFreeWithdrawalTime * 1000).toLocaleString());
    console.log("   Last Distribution Time:", lastDistributionTime);
    console.log("   Last Distribution Time (formatted):", new Date(lastDistributionTime * 1000).toLocaleString());

    // Check if timestamps are reasonable (within next 24 hours)
    const now = Math.floor(Date.now() / 1000);
    const oneDayFromNow = now + 86400;

    console.log("\n✅ Timestamp Validation:");
    console.log("   Current time:", now);
    console.log("   Current time (formatted):", new Date(now * 1000).toLocaleString());
    console.log("   One day from now:", oneDayFromNow);
    console.log("   One day from now (formatted):", new Date(oneDayFromNow * 1000).toLocaleString());

    if (nextInterestUpdate > now && nextInterestUpdate <= oneDayFromNow) {
        console.log("   ✅ Next Interest Update is reasonable (within next 24 hours)");
    } else {
        console.log("   ❌ Next Interest Update is not reasonable");
    }

    if (penaltyFreeWithdrawalTime > now && penaltyFreeWithdrawalTime <= oneDayFromNow) {
        console.log("   ✅ Penalty Free Withdrawal Time is reasonable (within next 24 hours)");
    } else {
        console.log("   ❌ Penalty Free Withdrawal Time is not reasonable");
    }
}

// Helper function to get contract addresses
async function getContractAddresses() {
    try {
        const fs = require('fs');
        const path = require('path');

        // Check if there's a deployment log file
        const logPath = path.join(__dirname, '../deploy-debug.log');
        if (fs.existsSync(logPath)) {
            const logContent = fs.readFileSync(logPath, 'utf8');

            // Extract addresses using regex
            const lendingManagerMatch = logContent.match(/LendingManager deployed to: (0x[a-fA-F0-9]{40})/);
            const liquidityPoolMatch = logContent.match(/LiquidityPoolV3 deployed to: (0x[a-fA-F0-9]{40})/);
            const glintTokenMatch = logContent.match(/GlintToken deployed to: (0x[a-fA-F0-9]{40})/);

            return {
                lendingManager: lendingManagerMatch ? lendingManagerMatch[1] : null,
                liquidityPool: liquidityPoolMatch ? liquidityPoolMatch[1] : null,
                glintToken: glintTokenMatch ? glintTokenMatch[1] : null
            };
        }
    } catch (error) {
        console.error("Error reading deployment log:", error);
    }

    // Fallback to environment variables
    return {
        lendingManager: process.env.LENDING_MANAGER_ADDRESS,
        liquidityPool: process.env.LIQUIDITY_POOL_ADDRESS,
        glintToken: process.env.GLINT_TOKEN_ADDRESS
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 