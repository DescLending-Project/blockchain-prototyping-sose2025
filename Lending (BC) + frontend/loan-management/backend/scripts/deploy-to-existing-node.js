const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("🚀 Deploying contracts to existing Hardhat node...");

    // Get signers
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    try {
        // Deploy GlintToken
        console.log("Deploying GlintToken...");
        const GlintToken = await ethers.getContractFactory("GlintToken");
        const glintToken = await GlintToken.deploy(ethers.parseEther("1000000")); // 1 million GLINT
        await glintToken.waitForDeployment();
        console.log("GlintToken deployed to:", glintToken.target);

        // Deploy MockPriceFeed for GlintToken
        console.log("Deploying MockPriceFeed for GlintToken...");
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        const glintPriceFeed = await MockPriceFeed.deploy(150000000, 8); // $1.50 with 8 decimals
        await glintPriceFeed.waitForDeployment();
        console.log("MockPriceFeed for GlintToken deployed to:", glintPriceFeed.target);

        // Deploy StablecoinManager
        console.log("Deploying StablecoinManager...");
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const stablecoinManager = await StablecoinManager.deploy(deployer.address);
        await stablecoinManager.waitForDeployment();
        console.log("StablecoinManager deployed to:", stablecoinManager.target);

        // Deploy LiquidityPool first (without initialization)
        console.log("Deploying LiquidityPool...");
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        const liquidityPool = await LiquidityPool.deploy();
        await liquidityPool.waitForDeployment();
        console.log("LiquidityPool deployed to:", liquidityPool.target);

        // Deploy LendingManager with LiquidityPool address
        console.log("Deploying LendingManager...");
        const LendingManager = await ethers.getContractFactory("LendingManager");
        const lendingManager = await LendingManager.deploy(deployer.address, liquidityPool.target);
        await lendingManager.waitForDeployment();
        console.log("LendingManager deployed to:", lendingManager.target);

        // Initialize LiquidityPool with both addresses
        console.log("Initializing LiquidityPool...");
        await liquidityPool.initialize(deployer.address, stablecoinManager.target, lendingManager.target);
        console.log("LiquidityPool initialized");

        // Set up GlintToken as collateral
        console.log("Setting up GlintToken as collateral...");
        await liquidityPool.setAllowedCollateral(glintToken.target, true);
        await liquidityPool.setPriceFeed(glintToken.target, glintPriceFeed.target);
        console.log("GlintToken set up as collateral");

        // Set up borrower activity for Account #3
        console.log("Setting up borrower activity for Account #3...");
        const borrowerAccount = new ethers.Wallet("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", ethers.provider);

        // Fund borrower account
        await deployer.sendTransaction({
            to: borrowerAccount.address,
            value: ethers.parseEther("10")
        });

        // Add liquidity to the pool first (deployer deposits 50 ETH)
        console.log("Adding liquidity to the pool...");
        await lendingManager.depositFunds({ value: ethers.parseEther("50") });
        console.log("Added 50 ETH liquidity to the pool");

        // Set credit score
        await liquidityPool.setCreditScore(borrowerAccount.address, 80);

        // Transfer GLINT tokens and set up collateral
        const glintAmount = ethers.parseEther("1000");
        await glintToken.transfer(borrowerAccount.address, glintAmount);
        await glintToken.connect(borrowerAccount).approve(liquidityPool.target, glintAmount);
        await liquidityPool.connect(borrowerAccount).depositCollateral(glintToken.target, glintAmount);

        // Borrow some ETH
        await liquidityPool.connect(borrowerAccount).borrow(ethers.parseEther("2"));

        console.log("\n✅ Deployment and setup completed!");
        console.log("\n📋 Contract addresses:");
        console.log("LiquidityPool:", liquidityPool.target);
        console.log("LendingManager:", lendingManager.target);
        console.log("GlintToken:", glintToken.target);
        console.log("StablecoinManager:", stablecoinManager.target);

        console.log("\n📊 Borrower account:", borrowerAccount.address);
        console.log("Credit Score: 80");
        console.log("GLINT Collateral: 1000 GLINT");
        console.log("Borrowed: 2 ETH");

        // Update frontend addresses
        console.log("\n🔄 Updating frontend addresses...");
        const fs = require('fs');
        const path = require('path');

        const appJsxPath = path.join(__dirname, '../../frontend/src/App.jsx');
        let appJsxContent = fs.readFileSync(appJsxPath, 'utf8');

        appJsxContent = appJsxContent.replace(
            /const POOL_ADDRESS = '[^']*';/,
            `const POOL_ADDRESS = '${liquidityPool.target}';`
        );
        appJsxContent = appJsxContent.replace(
            /const LENDING_MANAGER_ADDRESS = '[^']*';/,
            `const LENDING_MANAGER_ADDRESS = '${lendingManager.target}';`
        );

        fs.writeFileSync(appJsxPath, appJsxContent);
        console.log("✅ Frontend addresses updated");

    } catch (err) {
        console.error("❌ Deployment failed:", err.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 