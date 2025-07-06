const { ethers } = require("hardhat");

async function main() {
    const poolAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

    console.log("🔍 Debugging deployed contract at:", poolAddress);

    // Check if contract exists at address
    const code = await ethers.provider.getCode(poolAddress);
    console.log("Contract code exists:", code !== "0x");
    console.log("Code length:", code.length);

    if (code === "0x") {
        console.log("❌ No contract deployed at this address!");
        return;
    }

    // Try to get contract factory and attach
    try {
        const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
        const pool = LiquidityPoolV3.attach(poolAddress);

        console.log("✅ Successfully attached to contract");

        // Try to call a simple function first
        try {
            const balance = await pool.getBalance();
            console.log("✅ getBalance() works:", ethers.formatEther(balance), "ETH");
        } catch (err) {
            console.log("❌ getBalance() failed:", err.message);
        }

        // Try to call getAllowedCollateralTokens
        try {
            const tokens = await pool.getAllowedCollateralTokens();
            console.log("✅ getAllowedCollateralTokens() works:", tokens);
        } catch (err) {
            console.log("❌ getAllowedCollateralTokens() failed:", err.message);
        }

        // Try to call getCreditScore with a test address
        try {
            const testAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
            const score = await pool.getCreditScore(testAddress);
            console.log("✅ getCreditScore() works:", score.toString());
        } catch (err) {
            console.log("❌ getCreditScore() failed:", err.message);
            console.log("Error details:", err);
        }

        // Check if contract is initialized
        try {
            const owner = await pool.owner();
            console.log("✅ owner() works:", owner);
        } catch (err) {
            console.log("❌ owner() failed:", err.message);
        }

        // Try to get user debt
        try {
            const testAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
            const debt = await pool.userDebt(testAddress);
            console.log("✅ userDebt() works:", ethers.formatEther(debt), "ETH");
        } catch (err) {
            console.log("❌ userDebt() failed:", err.message);
        }

    } catch (err) {
        console.log("❌ Failed to attach to contract:", err.message);
    }
}

main().catch(console.error); 