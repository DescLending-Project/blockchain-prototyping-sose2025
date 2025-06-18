const { ethers } = require("hardhat");

async function main() {
    const LENDING_MANAGER_ADDRESS = '0x59a0f2A32F34633Cef830EAe11BF41801C4a2F0C';
    const TEST_ADDRESS = '0x0000000000000000000000000000000000000000';

    console.log("Testing frontend functions on Sepolia...");

    // Get the provider
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

    // Create contract instance with the exact ABI that the frontend uses
    const lendingManager = new ethers.Contract(LENDING_MANAGER_ADDRESS, [
        "function getLenderInfo(address lender) external view returns (uint256 balance, uint256 pendingInterest, uint256 earnedInterest, uint256 nextInterestUpdate, uint256 penaltyFreeWithdrawalTime, uint256 lastDistributionTime)",
        "function getInterestTierCount() external view returns (uint256)",
        "function getWithdrawalStatus(address lender) external view returns (uint256 availableAt, uint256 penaltyIfWithdrawnNow, bool isAvailableWithoutPenalty, uint256 nextInterestDistribution, uint256 availableInterest)"
    ], provider);

    console.log("\nTesting getLenderInfo...");
    try {
        const info = await lendingManager.getLenderInfo(TEST_ADDRESS);
        console.log("getLenderInfo() succeeded:");
        console.log("  balance:", ethers.formatEther(info.balance));
        console.log("  pendingInterest:", ethers.formatEther(info.pendingInterest));
        console.log("  earnedInterest:", ethers.formatEther(info.earnedInterest));
        console.log("  nextInterestUpdate:", new Date(Number(info.nextInterestUpdate) * 1000).toISOString());
        console.log("  penaltyFreeWithdrawalTime:", new Date(Number(info.penaltyFreeWithdrawalTime) * 1000).toISOString());
        console.log("  lastDistributionTime:", new Date(Number(info.lastDistributionTime) * 1000).toISOString());
    } catch (err) {
        console.log("getLenderInfo() failed:", err.message);
        console.log("Error details:", err);
    }

    console.log("\nTesting getInterestTierCount...");
    try {
        const count = await lendingManager.getInterestTierCount();
        console.log("getInterestTierCount() succeeded, count:", count.toString());
    } catch (err) {
        console.log("getInterestTierCount() failed:", err.message);
        console.log("Error details:", err);
    }

    console.log("\nTesting getWithdrawalStatus...");
    try {
        const status = await lendingManager.getWithdrawalStatus(TEST_ADDRESS);
        console.log("getWithdrawalStatus() succeeded:");
        console.log("  availableAt:", new Date(Number(status.availableAt) * 1000).toISOString());
        console.log("  penaltyIfWithdrawnNow:", ethers.formatEther(status.penaltyIfWithdrawnNow));
        console.log("  isAvailableWithoutPenalty:", status.isAvailableWithoutPenalty);
        console.log("  nextInterestDistribution:", new Date(Number(status.nextInterestDistribution) * 1000).toISOString());
        console.log("  availableInterest:", ethers.formatEther(status.availableInterest));
    } catch (err) {
        console.log("getWithdrawalStatus() failed:", err.message);
        console.log("Error details:", err);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 