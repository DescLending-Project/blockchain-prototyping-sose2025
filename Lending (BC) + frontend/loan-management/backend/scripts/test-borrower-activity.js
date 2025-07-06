const { ethers } = require("hardhat");

async function main() {
    const poolAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
    const borrowerAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

    console.log("🔍 Testing borrower activity for:", borrowerAddress);
    console.log("Contract address:", poolAddress);

    try {
        const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
        const pool = LiquidityPoolV3.attach(poolAddress);

        // Test userDebt function
        try {
            const debt = await pool.userDebt(borrowerAddress);
            console.log("✅ userDebt:", ethers.formatEther(debt), "ETH");
        } catch (err) {
            console.log("❌ userDebt failed:", err.message);
        }

        // Test getTotalCollateralValue function
        try {
            const collateralValue = await pool.getTotalCollateralValue(borrowerAddress);
            console.log("✅ getTotalCollateralValue:", ethers.formatEther(collateralValue), "USD");
        } catch (err) {
            console.log("❌ getTotalCollateralValue failed:", err.message);
        }

        // Test checkCollateralization function
        try {
            const [isHealthy, healthRatio] = await pool.checkCollateralization(borrowerAddress);
            console.log("✅ checkCollateralization - Healthy:", isHealthy, "Ratio:", healthRatio.toString(), "%");
        } catch (err) {
            console.log("❌ checkCollateralization failed:", err.message);
        }

        // Test getUserCollateral function for GLINT
        try {
            const glintTokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
            const glintCollateral = await pool.getUserCollateral(borrowerAddress, glintTokenAddress);
            console.log("✅ GLINT Collateral:", ethers.formatEther(glintCollateral), "GLINT");
        } catch (err) {
            console.log("❌ getUserCollateral failed:", err.message);
        }

        // Test getAllowedCollateralTokens
        try {
            const tokens = await pool.getAllowedCollateralTokens();
            console.log("✅ Allowed collateral tokens:", tokens);
        } catch (err) {
            console.log("❌ getAllowedCollateralTokens failed:", err.message);
        }

        // Test getBalance
        try {
            const balance = await pool.getBalance();
            console.log("✅ Pool balance:", ethers.formatEther(balance), "ETH");
        } catch (err) {
            console.log("❌ getBalance failed:", err.message);
        }

    } catch (err) {
        console.error("❌ Failed to test borrower activity:", err.message);
    }
}

main().catch(console.error); 