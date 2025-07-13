const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("🔍 Checking borrower account activity...");

    // Get signers
    const [deployer] = await ethers.getSigners();

    // Create borrower account from mockup simulation
    const borrowerAccount = new ethers.Wallet("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd", ethers.provider);

    console.log("👤 Borrower account:", borrowerAccount.address);

    // Get contract addresses from deployment
    const addresses = {
        liquidityPool: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
        lendingManager: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
        glintToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
    };

    // Connect to contracts
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const GlintToken = await ethers.getContractFactory("GlintToken");

    const liquidityPool = LiquidityPool.attach(addresses.liquidityPool);
    const lendingManager = LendingManager.attach(addresses.lendingManager);
    const glintToken = GlintToken.attach(addresses.glintToken);

    try {
        console.log("\n📊 Checking borrower data...");

        // Check credit score
        const creditScore = await liquidityPool.getCreditScore(borrowerAccount.address);
        console.log("Credit Score:", creditScore.toString());

        // Check current debt
        const currentDebt = await liquidityPool.userDebt(borrowerAccount.address);
        console.log("Current Debt:", ethers.formatEther(currentDebt), "ETH");

        // Check collateral value
        const collateralValue = await liquidityPool.getTotalCollateralValue(borrowerAccount.address);
        console.log("Collateral Value:", ethers.formatEther(collateralValue), "USD");

        // Check health ratio
        const [isHealthy, healthRatio] = await liquidityPool.checkCollateralization(borrowerAccount.address);
        console.log("Health Ratio:", healthRatio.toString(), "%");
        console.log("Position Healthy:", isHealthy);

        // Check GLINT balance
        const glintBalance = await glintToken.balanceOf(borrowerAccount.address);
        console.log("GLINT Balance:", ethers.formatEther(glintBalance), "GLINT");

        // Check if account has any collateral deposits
        const collateralDeposits = await liquidityPool.getUserCollateral(borrowerAccount.address, glintToken.target);
        console.log("GLINT Collateral Deposited:", ethers.formatEther(collateralDeposits), "GLINT");

        // Check borrow timestamp
        const borrowTimestamp = await liquidityPool.borrowTimestamp(borrowerAccount.address);
        console.log("Borrow Timestamp:", borrowTimestamp.toString());
        if (borrowTimestamp > 0) {
            console.log("Borrow Date:", new Date(Number(borrowTimestamp) * 1000).toISOString());
        }

        // Check if account has any activity in lending manager
        const lenderInfo = await lendingManager.getLenderInfo(borrowerAccount.address);
        console.log("\n📈 Lending Manager Info:");
        console.log("Balance:", ethers.formatEther(lenderInfo[0]), "ETH");
        console.log("Pending Interest:", ethers.formatEther(lenderInfo[1]), "ETH");
        console.log("Earned Interest:", ethers.formatEther(lenderInfo[2]), "ETH");

    } catch (err) {
        console.error("❌ Error checking borrower data:", err.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 