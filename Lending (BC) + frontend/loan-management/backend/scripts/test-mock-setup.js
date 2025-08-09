const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("🧪 Testing mock transaction setup...");
    
    try {
        // Load addresses
        const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/addresses.json')));
        const [deployer, , , borrower1] = await ethers.getSigners();
        
        console.log(`📋 Contract addresses:`);
        console.log(`   LiquidityPool: ${addresses.LiquidityPool}`);
        console.log(`   GlintToken: ${addresses.GlintToken}`);
        console.log(`   NullifierRegistry: ${addresses.nullifierRegistry}`);
        
        // Load contracts
        const LiquidityPool = await ethers.getContractAt('LiquidityPool', addresses.LiquidityPool);
        const GlintToken = await ethers.getContractAt('GlintToken', addresses.GlintToken);
        const NullifierRegistry = await ethers.getContractAt('NullifierRegistry', addresses.nullifierRegistry);
        
        // Check basic setup
        console.log(`\n🔍 Checking basic setup...`);
        
        // Pool balance
        const poolBalance = await LiquidityPool.getBalance();
        console.log(`   Pool balance: ${ethers.formatEther(poolBalance)} ETH`);
        
        // Borrower1 GLINT balance
        const glintBalance = await GlintToken.balanceOf(borrower1.address);
        console.log(`   Borrower1 GLINT balance: ${ethers.formatEther(glintBalance)}`);
        
        // Credit score
        const creditScore = await LiquidityPool.creditScore(borrower1.address);
        console.log(`   Borrower1 credit score: ${creditScore}`);
        
        // Collateral allowed
        const isAllowed = await LiquidityPool.isAllowedCollateral(addresses.GlintToken);
        console.log(`   GLINT allowed as collateral: ${isAllowed}`);
        
        // Check if we need to setup anything
        let needsSetup = false;
        
        if (poolBalance < ethers.parseEther('5')) {
            console.log(`⚠️  Pool needs more funds`);
            needsSetup = true;
        }
        
        if (glintBalance === 0n) {
            console.log(`⚠️  Borrower1 needs GLINT tokens`);
            needsSetup = true;
        }
        
        if (creditScore === 0n) {
            console.log(`⚠️  Borrower1 needs credit score`);
            needsSetup = true;
        }
        
        if (!isAllowed) {
            console.log(`⚠️  GLINT needs to be allowed as collateral`);
            needsSetup = true;
        }
        
        if (needsSetup) {
            console.log(`\n🔧 Performing setup...`);
            
            // Add pool funds
            if (poolBalance < ethers.parseEther('5')) {
                await deployer.sendTransaction({
                    to: await LiquidityPool.getAddress(),
                    value: ethers.parseEther('10')
                });
                console.log(`   ✅ Added funds to pool`);
            }
            
            // Mint GLINT tokens
            if (glintBalance === 0n) {
                await GlintToken.connect(deployer).mint(borrower1.address, ethers.parseEther('1000'));
                console.log(`   ✅ Minted GLINT tokens to borrower1`);
            }
            
            // Set credit score
            if (creditScore === 0n) {
                await LiquidityPool.connect(deployer).setCreditScore(borrower1.address, 85);
                console.log(`   ✅ Set credit score for borrower1`);
            }
            
            // Allow GLINT as collateral
            if (!isAllowed) {
                await LiquidityPool.connect(deployer).setAllowedCollateral(addresses.GlintToken, true);
                console.log(`   ✅ Allowed GLINT as collateral`);
            }
            
            // Setup nullifier registry
            try {
                await NullifierRegistry.connect(borrower1).selectAccounts([borrower1.address]);
                console.log(`   ✅ Setup nullifier registry for borrower1`);
            } catch (error) {
                console.log(`   ⚠️  Nullifier setup: ${error.message}`);
            }
            
        } else {
            console.log(`\n✅ All setup looks good!`);
        }
        
        // Final status check
        console.log(`\n📊 Final status:`);
        const finalPoolBalance = await LiquidityPool.getBalance();
        const finalGlintBalance = await GlintToken.balanceOf(borrower1.address);
        const finalCreditScore = await LiquidityPool.creditScore(borrower1.address);
        const finalIsAllowed = await LiquidityPool.isAllowedCollateral(addresses.GlintToken);
        
        console.log(`   Pool balance: ${ethers.formatEther(finalPoolBalance)} ETH`);
        console.log(`   Borrower1 GLINT: ${ethers.formatEther(finalGlintBalance)}`);
        console.log(`   Credit score: ${finalCreditScore}`);
        console.log(`   GLINT allowed: ${finalIsAllowed}`);
        
        const allGood = finalPoolBalance >= ethers.parseEther('5') && 
                       finalGlintBalance > 0n && 
                       finalCreditScore > 0n && 
                       finalIsAllowed;
        
        if (allGood) {
            console.log(`\n🎉 Setup complete! Ready to run mock transactions.`);
        } else {
            console.log(`\n❌ Setup incomplete. Please check the issues above.`);
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
