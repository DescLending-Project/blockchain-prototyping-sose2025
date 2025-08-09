const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

// Helper function to generate unique nullifiers for borrow operations
function generateNullifier(index) {
    return ethers.keccak256(ethers.toUtf8Bytes(`diagnose_nullifier_${Date.now()}_${index}`));
}

async function main() {
    console.log("🔍 Diagnosing borrow issue...");
    
    try {
        // Load deployed contract addresses
        const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/addresses.json')));
        const [deployer, lender1, lender2, borrower1] = await ethers.getSigners();
        
        console.log(`📋 Contract addresses:`);
        console.log(`   LiquidityPool: ${addresses.LiquidityPool}`);
        console.log(`   GlintToken: ${addresses.GlintToken}`);
        console.log(`   MockPriceFeed: ${addresses.MockPriceFeed}`);
        console.log(`   NullifierRegistry: ${addresses.nullifierRegistry}`);
        
        // Load contracts
        const LiquidityPool = await ethers.getContractAt('LiquidityPool', addresses.LiquidityPool);
        const GlintToken = await ethers.getContractAt('GlintToken', addresses.GlintToken);
        const NullifierRegistry = await ethers.getContractAt('NullifierRegistry', addresses.nullifierRegistry);
        const MockPriceFeed = await ethers.getContractAt('MockPriceFeed', addresses.MockPriceFeed);
        
        console.log(`\n🔧 Setting up prerequisites...`);
        
        // 1. Ensure pool has funds
        const poolBalance = await LiquidityPool.getBalance();
        console.log(`   Pool balance: ${ethers.formatEther(poolBalance)} ETH`);
        
        if (poolBalance < ethers.parseEther('5')) {
            console.log(`   Adding funds to pool...`);
            await deployer.sendTransaction({
                to: await LiquidityPool.getAddress(),
                value: ethers.parseEther('10')
            });
            console.log(`   ✅ Added 10 ETH to pool`);
        }
        
        // 2. Setup credit score
        const creditScore = await LiquidityPool.creditScore(borrower1.address);
        console.log(`   Borrower1 credit score: ${creditScore}`);
        
        if (creditScore === 0n) {
            console.log(`   Setting credit score...`);
            await LiquidityPool.connect(deployer).setCreditScore(borrower1.address, 85);
            console.log(`   ✅ Set credit score to 85`);
        }
        
        // 3. Setup GLINT as collateral
        const isAllowed = await LiquidityPool.isAllowedCollateral(addresses.GlintToken);
        console.log(`   GLINT allowed as collateral: ${isAllowed}`);
        
        if (!isAllowed) {
            console.log(`   Allowing GLINT as collateral...`);
            await LiquidityPool.connect(deployer).setAllowedCollateral(addresses.GlintToken, true);
            console.log(`   ✅ GLINT now allowed as collateral`);
        }
        
        // 4. Setup price feed
        const priceFeed = await LiquidityPool.priceFeed(addresses.GlintToken);
        console.log(`   GLINT price feed: ${priceFeed}`);
        
        if (priceFeed === ethers.ZeroAddress) {
            console.log(`   Setting price feed...`);
            await LiquidityPool.connect(deployer).setPriceFeed(addresses.GlintToken, addresses.MockPriceFeed);
            console.log(`   ✅ Set price feed for GLINT`);
        }
        
        // 5. Check price feed value
        const price = await MockPriceFeed.latestRoundData();
        console.log(`   GLINT price: $${ethers.formatUnits(price[1], 8)}`);
        
        // 6. Mint GLINT tokens to borrower1
        const glintBalance = await GlintToken.balanceOf(borrower1.address);
        console.log(`   Borrower1 GLINT balance: ${ethers.formatEther(glintBalance)}`);
        
        if (glintBalance < ethers.parseEther('500')) {
            console.log(`   Minting GLINT tokens...`);
            await GlintToken.connect(deployer).mint(borrower1.address, ethers.parseEther('1000'));
            console.log(`   ✅ Minted 1000 GLINT tokens`);
        }
        
        // 7. Setup nullifier registry
        console.log(`   Setting up nullifier registry...`);
        try {
            await NullifierRegistry.connect(borrower1).selectAccounts([borrower1.address]);
            console.log(`   ✅ Nullifier registry setup complete`);
        } catch (error) {
            console.log(`   ⚠️ Nullifier setup: ${error.message}`);
        }
        
        console.log(`\n💰 Depositing collateral...`);
        
        // 8. Approve and deposit collateral
        const collateralAmount = ethers.parseEther('500');
        await GlintToken.connect(borrower1).approve(await LiquidityPool.getAddress(), collateralAmount);
        await LiquidityPool.connect(borrower1).depositCollateral(addresses.GlintToken, collateralAmount);
        
        const collateralBalance = await LiquidityPool.collateralBalance(borrower1.address, addresses.GlintToken);
        console.log(`   Deposited collateral: ${ethers.formatEther(collateralBalance)} GLINT`);
        
        // 9. Check collateral value
        const totalCollateralValue = await LiquidityPool.getTotalCollateralValue(borrower1.address);
        console.log(`   Total collateral value: ${ethers.formatEther(totalCollateralValue)} ETH`);
        
        // 10. Get borrow terms
        const borrowTerms = await LiquidityPool.getBorrowTerms(borrower1.address);
        console.log(`   Collateral ratio required: ${borrowTerms[0]}%`);
        console.log(`   Interest rate modifier: ${borrowTerms[1]}`);
        console.log(`   Max loan amount: ${ethers.formatEther(borrowTerms[2])} ETH`);
        
        console.log(`\n🚀 Attempting to borrow...`);
        
        // 11. Try different borrow amounts
        const borrowAmounts = [
            ethers.parseEther('0.1'),
            ethers.parseEther('0.5'),
            ethers.parseEther('1.0'),
            ethers.parseEther('2.0')
        ];
        
        for (const amount of borrowAmounts) {
            console.log(`\n   Testing borrow amount: ${ethers.formatEther(amount)} ETH`);
            
            const nullifier = generateNullifier(Math.floor(Math.random() * 1000));
            
            try {
                // First try static call
                await LiquidityPool.connect(borrower1).borrow.staticCall(amount, nullifier);
                console.log(`     ✅ Static call successful for ${ethers.formatEther(amount)} ETH`);
                
                // If static call works, try actual transaction
                const tx = await LiquidityPool.connect(borrower1).borrow(amount, nullifier);
                await tx.wait();
                console.log(`     ✅ Actual borrow successful! Hash: ${tx.hash}`);
                
                // Check debt
                const debt = await LiquidityPool.userDebt(borrower1.address);
                console.log(`     New debt: ${ethers.formatEther(debt)} ETH`);
                
                // Check UserHistory
                const history = await LiquidityPool.getUserHistory(borrower1.address);
                console.log(`     UserHistory: firstInteraction=${history.firstInteractionTimestamp}, payments=${history.succesfullPayments}, liquidations=${history.liquidations}`);
                
                break; // Success, exit loop
                
            } catch (error) {
                console.log(`     ❌ Failed for ${ethers.formatEther(amount)} ETH: ${error.message}`);
                
                // Try to get more specific error
                if (error.message.includes('revert')) {
                    try {
                        // Try to decode the revert reason
                        const errorData = error.data;
                        if (errorData) {
                            console.log(`     Error data: ${errorData}`);
                        }
                    } catch (decodeError) {
                        console.log(`     Could not decode error data`);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error("❌ Diagnosis failed:", error.message);
        console.error(error.stack);
    }
}

main()
    .then(() => {
        console.log("\n🎉 Diagnosis completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Diagnosis error:", error);
        process.exit(1);
    });
