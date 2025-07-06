const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("🔍 Debugging timestamp issues...");

    // Get signers
    const [deployer] = await ethers.getSigners();

    // Create lender account (same as in mockup)
    const lenderAccount = new ethers.Wallet("0x1234567890123456789012345678901234567890123456789012345678901234", ethers.provider);

    // Use the lender account from mockup simulation instead
    const mockupLenderAccount = "0xeCc6f14F4b64EeDD56111d80f46Ce46933dC2d64";

    // Get contract addresses from deployment
    const addresses = {
        lendingManager: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6" // From latest deployment
    };

    // Connect to LendingManager
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = LendingManager.attach(addresses.lendingManager);

    console.log("📋 Contract addresses:");
    console.log("  LendingManager:", addresses.lendingManager);

    try {
        // Get current block timestamp
        const currentBlock = await ethers.provider.getBlock('latest');
        const currentTimestamp = currentBlock.timestamp;
        console.log("\n⏰ Current block timestamp:", currentTimestamp);
        console.log("   Current time:", new Date(currentTimestamp * 1000).toISOString());

        // Get lender info
        console.log("\n👤 Lender account:", mockupLenderAccount);
        const lenderInfo = await lendingManager.getLenderInfo(mockupLenderAccount);

        console.log("\n📊 Lender Info:");
        console.log("  Balance:", ethers.formatEther(lenderInfo[0]), "ETH");
        console.log("  Pending Interest:", ethers.formatEther(lenderInfo[1]), "ETH");
        console.log("  Earned Interest:", ethers.formatEther(lenderInfo[2]), "ETH");
        console.log("  Next Interest Update (raw):", lenderInfo[3].toString());
        console.log("  Penalty Free Withdrawal Time (raw):", lenderInfo[4].toString());
        console.log("  Last Distribution Time (raw):", lenderInfo[5].toString());

        // Convert timestamps to dates
        const nextInterestDate = new Date(Number(lenderInfo[3]) * 1000);
        const penaltyFreeDate = new Date(Number(lenderInfo[4]) * 1000);
        const lastDistDate = new Date(Number(lenderInfo[5]) * 1000);

        console.log("\n📅 Timestamps converted to dates:");
        console.log("  Next Interest Update:", nextInterestDate.toISOString());
        console.log("  Penalty Free Withdrawal Time:", penaltyFreeDate.toISOString());
        console.log("  Last Distribution Time:", lastDistDate.toISOString());

        // Calculate differences
        const nextInterestDiff = Number(lenderInfo[3]) - currentTimestamp;
        const penaltyFreeDiff = Number(lenderInfo[4]) - currentTimestamp;
        const lastDistDiff = Number(lenderInfo[5]) - currentTimestamp;

        console.log("\n⏱️ Time differences (seconds):");
        console.log("  Next Interest Update diff:", nextInterestDiff);
        console.log("  Penalty Free Withdrawal diff:", penaltyFreeDiff);
        console.log("  Last Distribution diff:", lastDistDiff);

        console.log("\n⏱️ Time differences (hours):");
        console.log("  Next Interest Update diff:", (nextInterestDiff / 3600).toFixed(2), "hours");
        console.log("  Penalty Free Withdrawal diff:", (penaltyFreeDiff / 3600).toFixed(2), "hours");
        console.log("  Last Distribution diff:", (lastDistDiff / 3600).toFixed(2), "hours");

        // Check if timestamps are reasonable
        const SECONDS_PER_DAY = 86400;
        const MAX_REASONABLE_DAYS = 30;

        console.log("\n🔍 Timestamp analysis:");
        if (Math.abs(nextInterestDiff) > SECONDS_PER_DAY * MAX_REASONABLE_DAYS) {
            console.log("  ❌ Next Interest Update timestamp is unreasonable (>30 days)");
        } else {
            console.log("  ✅ Next Interest Update timestamp is reasonable");
        }

        if (Math.abs(penaltyFreeDiff) > SECONDS_PER_DAY * MAX_REASONABLE_DAYS) {
            console.log("  ❌ Penalty Free Withdrawal timestamp is unreasonable (>30 days)");
        } else {
            console.log("  ✅ Penalty Free Withdrawal timestamp is reasonable");
        }

        if (Math.abs(lastDistDiff) > SECONDS_PER_DAY * MAX_REASONABLE_DAYS) {
            console.log("  ❌ Last Distribution timestamp is unreasonable (>30 days)");
        } else {
            console.log("  ✅ Last Distribution timestamp is reasonable");
        }

    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 