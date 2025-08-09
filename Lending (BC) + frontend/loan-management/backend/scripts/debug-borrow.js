const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

// Helper function to generate unique nullifiers for borrow operations
function generateNullifier(index) {
    return ethers.keccak256(ethers.toUtf8Bytes(`debug_nullifier_${Date.now()}_${index}`));
}

async function main() {
    console.log("🔍 Debugging borrow operation...");
    
    try {
        // Load deployed contract addresses
        const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/addresses.json')));
        const [deployer, lender1, lender2, borrower1, borrower2, ...others] = await ethers.getSigners();
        
        console.log(`📋 Using addresses:`);
        console.log(`   LiquidityPool: ${addresses.LiquidityPool}`);
        console.log(`   GlintToken: ${addresses.GlintToken}`);
        console.log(`   NullifierRegistry: ${addresses.nullifierRegistry}`);
        console.log(`   Borrower1: ${borrower1.address}`);
        
        // Load contracts
        const LiquidityPool = await ethers.getContractAt('LiquidityPool', addresses.LiquidityPool);
        const GlintToken = await ethers.getContractAt('GlintToken', addresses.GlintToken);
        const NullifierRegistry = await ethers.getContractAt('NullifierRegistry', addresses.nullifierRegistry);
        
        // Check contract deployment
        const lpCode = await ethers.provider.getCode(addresses.LiquidityPool);
        const gtCode = await ethers.provider.getCode(addresses.GlintToken);
        const nrCode = await ethers.provider.getCode(addresses.nullifierRegistry);
        
        console.log(`\n📦 Contract deployment status:`);
        console.log(`   LiquidityPool: ${lpCode !== '0x' ? '✅ Deployed' : '❌ Not deployed'}`);
        console.log(`   GlintToken: ${gtCode !== '0x' ? '✅ Deployed' : '❌ Not deployed'}`);
        console.log(`   NullifierRegistry: ${nrCode !== '0x' ? '✅ Deployed' : '❌ Not deployed'}`);
        
        // Check borrower1 balances
        const borrower1EthBalance = await ethers.provider.getBalance(borrower1.address);
        const borrower1GlintBalance = await GlintToken.balanceOf(borrower1.address);
        
        console.log(`\n💰 Borrower1 balances:`);
        console.log(`   ETH: ${ethers.formatEther(borrower1EthBalance)}`);
        console.log(`   GLINT: ${ethers.formatEther(borrower1GlintBalance)}`);
        
        // Check if borrower1 has GLINT tokens
        if (borrower1GlintBalance === 0n) {
            console.log(`\n🔧 Minting GLINT tokens to borrower1...`);
            await GlintToken.connect(deployer).mint(borrower1.address, ethers.parseEther('1000'));
            const newBalance = await GlintToken.balanceOf(borrower1.address);
            console.log(`   New GLINT balance: ${ethers.formatEther(newBalance)}`);
        }
        
        // Setup NullifierRegistry account
        console.log(`\n🔧 Setting up NullifierRegistry account...`);
        try {
            await NullifierRegistry.connect(borrower1).selectAccounts([borrower1.address]);
            console.log(`   ✅ Account selected successfully`);
        } catch (error) {
            console.log(`   ⚠️ Account selection failed: ${error.message}`);
        }
        
        // Check credit score
        const creditScore = await LiquidityPool.creditScore(borrower1.address);
        console.log(`\n📊 Borrower1 credit score: ${creditScore}`);
        
        if (creditScore === 0n) {
            console.log(`🔧 Setting credit score...`);
            await LiquidityPool.connect(deployer).setCreditScore(borrower1.address, 85);
            const newScore = await LiquidityPool.creditScore(borrower1.address);
            console.log(`   New credit score: ${newScore}`);
        }
        
        // Check pool balance
        const poolBalance = await LiquidityPool.getBalance();
        console.log(`\n🏦 Pool balance: ${ethers.formatEther(poolBalance)} ETH`);
        
        if (poolBalance === 0n) {
            console.log(`🔧 Adding funds to pool...`);
            await deployer.sendTransaction({
                to: await LiquidityPool.getAddress(),
                value: ethers.parseEther('10')
            });
            const newPoolBalance = await LiquidityPool.getBalance();
            console.log(`   New pool balance: ${ethers.formatEther(newPoolBalance)} ETH`);
        }
        
        // Check existing debt
        const existingDebt = await LiquidityPool.userDebt(borrower1.address);
        console.log(`\n💳 Existing debt: ${ethers.formatEther(existingDebt)} ETH`);
        
        // Check collateral setup
        const isAllowedCollateral = await LiquidityPool.isAllowedCollateral(addresses.GlintToken);
        console.log(`\n🔒 Collateral status:`);
        console.log(`   GLINT allowed as collateral: ${isAllowedCollateral}`);
        
        if (!isAllowedCollateral) {
            console.log(`🔧 Setting up GLINT as allowed collateral...`);
            await LiquidityPool.connect(deployer).setAllowedCollateral(addresses.GlintToken, true);
            console.log(`   ✅ GLINT now allowed as collateral`);
        }
        
        // Check price feed
        const priceFeed = await LiquidityPool.priceFeed(addresses.GlintToken);
        console.log(`   Price feed: ${priceFeed}`);
        
        // Step 1: Approve and deposit collateral
        console.log(`\n🔧 Step 1: Depositing collateral...`);
        const collateralAmount = ethers.parseEther('100');
        
        try {
            await GlintToken.connect(borrower1).approve(await LiquidityPool.getAddress(), collateralAmount);
            console.log(`   ✅ Approved ${ethers.formatEther(collateralAmount)} GLINT`);
            
            await LiquidityPool.connect(borrower1).depositCollateral(addresses.GlintToken, collateralAmount);
            console.log(`   ✅ Deposited ${ethers.formatEther(collateralAmount)} GLINT as collateral`);
            
            // Check collateral balance
            const collateralBalance = await LiquidityPool.collateralBalance(borrower1.address, addresses.GlintToken);
            console.log(`   Collateral balance: ${ethers.formatEther(collateralBalance)} GLINT`);
            
        } catch (error) {
            console.log(`   ❌ Collateral deposit failed: ${error.message}`);
            return;
        }
        
        // Step 2: Attempt to borrow
        console.log(`\n🔧 Step 2: Attempting to borrow...`);
        const borrowAmount = ethers.parseEther('0.5');
        const nullifier = generateNullifier(1);
        
        console.log(`   Borrow amount: ${ethers.formatEther(borrowAmount)} ETH`);
        console.log(`   Nullifier: ${nullifier}`);
        
        // Check if nullifier is already used
        try {
            const isNullifierUsed = await NullifierRegistry.isNullifierUsed(nullifier);
            console.log(`   Nullifier already used: ${isNullifierUsed}`);
        } catch (error) {
            console.log(`   Could not check nullifier status: ${error.message}`);
        }
        
        // Check borrow terms
        try {
            const borrowTerms = await LiquidityPool.getBorrowTerms(borrower1.address);
            console.log(`   Borrow terms: collateralRatio=${borrowTerms[0]}, interestRateModifier=${borrowTerms[1]}, maxLoanAmount=${ethers.formatEther(borrowTerms[2])}`);
        } catch (error) {
            console.log(`   Could not get borrow terms: ${error.message}`);
        }
        
        // Attempt the borrow
        try {
            console.log(`   🚀 Executing borrow transaction...`);
            const tx = await LiquidityPool.connect(borrower1).borrow(borrowAmount, nullifier);
            await tx.wait();
            console.log(`   ✅ Borrow successful! Transaction hash: ${tx.hash}`);
            
            // Check new debt
            const newDebt = await LiquidityPool.userDebt(borrower1.address);
            console.log(`   New debt: ${ethers.formatEther(newDebt)} ETH`);
            
            // Check UserHistory
            const history = await LiquidityPool.getUserHistory(borrower1.address);
            console.log(`   UserHistory: firstInteraction=${history.firstInteractionTimestamp}, payments=${history.succesfullPayments}, liquidations=${history.liquidations}`);
            
        } catch (error) {
            console.log(`   ❌ Borrow failed: ${error.message}`);
            
            // Try to get more detailed error information
            try {
                console.log(`\n🔍 Attempting to call borrow with static call for better error info...`);
                await LiquidityPool.connect(borrower1).borrow.staticCall(borrowAmount, nullifier);
            } catch (staticError) {
                console.log(`   Static call error: ${staticError.message}`);
            }
        }
        
    } catch (error) {
        console.error("❌ Debug script failed:", error);
    }
}

main()
    .then(() => {
        console.log("\n🎉 Debug script completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Debug script error:", error);
        process.exit(1);
    });
