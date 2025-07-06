const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("🔍 Checking current account status...");

    // Get signers
    const [deployer] = await ethers.getSigners();

    console.log("👤 Deployer account:", deployer.address);

    // Get contract addresses from deployment
    const addresses = {
        liquidityPool: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
        lendingManager: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
        glintToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
    };

    // Connect to contracts
    const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const GlintToken = await ethers.getContractFactory("GlintToken");

    const liquidityPool = LiquidityPoolV3.attach(addresses.liquidityPool);
    const lendingManager = LendingManager.attach(addresses.lendingManager);
    const glintToken = GlintToken.attach(addresses.glintToken);

    try {
        // Check all accounts from hardhat
        const accounts = await ethers.getSigners();

        console.log("\n📋 Available accounts:");
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const balance = await ethers.provider.getBalance(account.address);

            console.log(`Account #${i}: ${account.address} (${ethers.formatEther(balance)} ETH)`);

            // Check if this account has any borrower activity
            try {
                const creditScore = await liquidityPool.getCreditScore(account.address);
                const debt = await liquidityPool.userDebt(account.address);
                const collateralValue = await liquidityPool.getTotalCollateralValue(account.address);

                if (creditScore > 0 || debt > 0 || collateralValue > 0) {
                    console.log(`  ✅ Has borrower activity:`);
                    console.log(`     Credit Score: ${creditScore}`);
                    console.log(`     Debt: ${ethers.formatEther(debt)} ETH`);
                    console.log(`     Collateral Value: ${ethers.formatEther(collateralValue)} USD`);

                    // Check GLINT collateral
                    const glintCollateral = await liquidityPool.getUserCollateral(account.address, glintToken.target);
                    if (glintCollateral > 0) {
                        console.log(`     GLINT Collateral: ${ethers.formatEther(glintCollateral)} GLINT`);
                    }
                }
            } catch (err) {
                // Account has no activity
            }
        }

        // Check the specific borrower account we set up
        const borrowerAccount = new ethers.Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", ethers.provider);
        console.log(`\n🎯 Checking our configured borrower account: ${borrowerAccount.address}`);

        try {
            const creditScore = await liquidityPool.getCreditScore(borrowerAccount.address);
            const debt = await liquidityPool.userDebt(borrowerAccount.address);
            const collateralValue = await liquidityPool.getTotalCollateralValue(borrowerAccount.address);
            const glintCollateral = await liquidityPool.getUserCollateral(borrowerAccount.address, glintToken.target);

            console.log(`Credit Score: ${creditScore}`);
            console.log(`Debt: ${ethers.formatEther(debt)} ETH`);
            console.log(`Collateral Value: ${ethers.formatEther(collateralValue)} USD`);
            console.log(`GLINT Collateral: ${ethers.formatEther(glintCollateral)} GLINT`);

            if (creditScore > 0 || debt > 0 || collateralValue > 0) {
                console.log("\n✅ This account has borrower activity!");
                console.log("Use this private key in MetaMask:");
                console.log(borrowerAccount.privateKey);
            } else {
                console.log("\n❌ This account has no borrower activity");
            }
        } catch (err) {
            console.log("❌ Error checking borrower account:", err.message);
        }

    } catch (err) {
        console.error("❌ Error checking accounts:", err.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 