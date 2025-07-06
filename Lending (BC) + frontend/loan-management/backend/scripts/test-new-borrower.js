const { ethers } = require("hardhat");

async function main() {
    const poolAddress = "0x4C4a2f8c81640e47606d3fd77B353E87Ba015584";
    const borrowerAddress = "0x5d46aC553A974ef992A08eeef0A05990802F01F6";

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
            const glintTokenAddress = "0x162A433068F51e18b7d13932F27e66a3f99E6890";
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

        // Test getCreditScore
        try {
            const score = await pool.getCreditScore(borrowerAddress);
            console.log("✅ Credit Score:", score.toString());
        } catch (err) {
            console.log("❌ getCreditScore failed:", err.message);
        }

    } catch (err) {
        console.error("❌ Failed to test borrower activity:", err.message);
    }
}

main().catch(console.error); 