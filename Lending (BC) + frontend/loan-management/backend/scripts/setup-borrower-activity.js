const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("🚀 Setting up proper borrower activity...");

    // Get signers
    const [deployer] = await ethers.getSigners();

    // Use Account #3 as borrower (this is the correct borrower account)
    const borrowerAccount = new ethers.Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", ethers.provider);

    console.log("👤 Setting up borrower account:", borrowerAccount.address);

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
        // Fund borrower account with ETH for gas and repayments
        console.log("💰 Funding borrower account with ETH...");
        await deployer.sendTransaction({
            to: borrowerAccount.address,
            value: ethers.parseEther("10")
        });

        // Set credit score to 80 (good borrower)
        console.log("📊 Setting credit score to 80...");
        await liquidityPool.connect(deployer).setCreditScore(borrowerAccount.address, 80);

        // Transfer GLINT tokens to borrower for collateral
        console.log("🪙 Transferring GLINT tokens for collateral...");
        const glintAmount = ethers.parseEther("1000"); // 1000 GLINT tokens
        await glintToken.connect(deployer).transfer(borrowerAccount.address, glintAmount);

        // Approve GLINT tokens for the liquidity pool
        await glintToken.connect(borrowerAccount).approve(liquidityPool.target, glintAmount);

        // Deposit GLINT as collateral
        console.log("🏦 Depositing GLINT as collateral...");
        await liquidityPool.connect(borrowerAccount).depositCollateral(glintToken.target, glintAmount);

        // Fast forward time a bit
        console.log("⏰ Fast forwarding time...");
        await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 1 week
        await ethers.provider.send("evm_mine");

        // Borrow some ETH
        console.log("💸 Borrowing 2 ETH...");
        const borrowAmount = ethers.parseEther("2");
        await liquidityPool.connect(borrowerAccount).borrow(borrowAmount);

        // Fast forward time again
        await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 1 more week
        await ethers.provider.send("evm_mine");

        // Repay some debt
        console.log("💳 Repaying 1 ETH...");
        const repayAmount = ethers.parseEther("1");
        await liquidityPool.connect(borrowerAccount).repay({ value: repayAmount });

        // Fast forward time again
        await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 1 more week
        await ethers.provider.send("evm_mine");

        // Add more collateral
        console.log("🏦 Adding more GLINT collateral...");
        const additionalGlint = ethers.parseEther("200");
        await glintToken.connect(deployer).transfer(borrowerAccount.address, additionalGlint);
        await glintToken.connect(borrowerAccount).approve(liquidityPool.target, additionalGlint);
        await liquidityPool.connect(borrowerAccount).depositCollateral(glintToken.target, additionalGlint);

        // Borrow a bit more
        console.log("💸 Borrowing 1 more ETH...");
        const borrowAmount2 = ethers.parseEther("1");
        await liquidityPool.connect(borrowerAccount).borrow(borrowAmount2);

        // Check final status
        console.log("\n✅ Borrower setup completed!");
        console.log("\n📊 Final borrower status:");

        const creditScore = await liquidityPool.getCreditScore(borrowerAccount.address);
        console.log("Credit Score:", creditScore.toString());

        const currentDebt = await liquidityPool.userDebt(borrowerAccount.address);
        console.log("Current Debt:", ethers.formatEther(currentDebt), "ETH");

        const collateralValue = await liquidityPool.getTotalCollateralValue(borrowerAccount.address);
        console.log("Collateral Value:", ethers.formatEther(collateralValue), "USD");

        const [isHealthy, healthRatio] = await liquidityPool.checkCollateralization(borrowerAccount.address);
        console.log("Health Ratio:", healthRatio.toString(), "%");
        console.log("Position Healthy:", isHealthy);

        // Check GLINT collateral
        const glintCollateral = await liquidityPool.getUserCollateral(borrowerAccount.address, glintToken.target);
        console.log("GLINT Collateral Deposited:", ethers.formatEther(glintCollateral), "GLINT");

        console.log("\n🎉 You can now use this account in the frontend!");
        console.log("Account Address:", borrowerAccount.address);
        console.log("Private Key:", borrowerAccount.privateKey);
        console.log("\n📋 This account has:");
        console.log("   - Credit Score: 80");
        console.log("   - 1200 GLINT tokens as collateral");
        console.log("   - 2 ETH borrowed (3 total - 1 repaid)");
        console.log("   - Multiple transaction history");

    } catch (err) {
        console.error("❌ Error setting up borrower:", err.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 