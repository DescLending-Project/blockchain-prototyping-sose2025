const { ethers } = require("hardhat");

async function main() {
    const poolAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
    const testAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const pool = LiquidityPool.attach(poolAddress);

    try {
        const score = await pool.getCreditScore(testAddress);
        console.log("Credit score for", testAddress, ":", score.toString());
    } catch (err) {
        console.error("Error calling getCreditScore:", err);
    }
}

main(); 