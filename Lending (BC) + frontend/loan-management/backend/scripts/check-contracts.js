const { ethers } = require("hardhat");

async function main() {
    const CONTRACT_ADDRESS = '0xB2B051D52e816305BbB37ee83A2dB4aFaae0c55C';
    const LENDING_MANAGER_ADDRESS = '0x59a0f2A32F34633Cef830EAe11BF41801C4a2F0C';

    console.log("Checking contracts on Sepolia...");

    // Get the provider
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

    // Check LiquidityPoolV3
    console.log("\nChecking LiquidityPoolV3 at:", CONTRACT_ADDRESS);
    const liquidityPoolCode = await provider.getCode(CONTRACT_ADDRESS);
    if (liquidityPoolCode === '0x') {
        console.log("LiquidityPoolV3 is NOT deployed at this address");
    } else {
        console.log("LiquidityPoolV3 is deployed");

        // Try to call getBalance
        try {
            const liquidityPool = new ethers.Contract(CONTRACT_ADDRESS, [
                "function getBalance() external view returns (uint256)"
            ], provider);
            const balance = await liquidityPool.getBalance();
            console.log("getBalance() works, balance:", ethers.formatEther(balance), "ETH");
        } catch (err) {
            console.log("getBalance() failed:", err.message);
        }
    }

    // Check LendingManager
    console.log("\nChecking LendingManager at:", LENDING_MANAGER_ADDRESS);
    const lendingManagerCode = await provider.getCode(LENDING_MANAGER_ADDRESS);
    if (lendingManagerCode === '0x') {
        console.log("LendingManager is NOT deployed at this address");
    } else {
        console.log("LendingManager is deployed");

        // Try to call getLenderInfo
        try {
            const lendingManager = new ethers.Contract(LENDING_MANAGER_ADDRESS, [
                "function getLenderInfo(address lender) external view returns (uint256 balance, uint256 pendingInterest, uint256 earnedInterest, uint256 nextInterestUpdate, uint256 penaltyFreeWithdrawalTime, uint256 lastDistributionTime)"
            ], provider);
            const info = await lendingManager.getLenderInfo("0x0000000000000000000000000000000000000000");
            console.log("getLenderInfo() works");
        } catch (err) {
            console.log("getLenderInfo() failed:", err.message);
        }

        // Try to call getInterestTierCount
        try {
            const lendingManager = new ethers.Contract(LENDING_MANAGER_ADDRESS, [
                "function getInterestTierCount() external view returns (uint256)"
            ], provider);
            const count = await lendingManager.getInterestTierCount();
            console.log("getInterestTierCount() works, count:", count.toString());
        } catch (err) {
            console.log("getInterestTierCount() failed:", err.message);
        }

        // Try to call getWithdrawalStatus
        try {
            const lendingManager = new ethers.Contract(LENDING_MANAGER_ADDRESS, [
                "function getWithdrawalStatus(address lender) external view returns (uint256 availableAt, uint256 penaltyIfWithdrawnNow, bool isAvailableWithoutPenalty, uint256 nextInterestDistribution, uint256 availableInterest)"
            ], provider);
            const status = await lendingManager.getWithdrawalStatus("0x0000000000000000000000000000000000000000");
            console.log("getWithdrawalStatus() works");
        } catch (err) {
            console.log("getWithdrawalStatus() failed:", err.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 