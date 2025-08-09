const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

// Helper function to generate unique nullifiers for borrow operations
function generateNullifier(index) {
    return ethers.keccak256(ethers.toUtf8Bytes(`simple_test_${Date.now()}_${index}`));
}

async function main() {
    console.log("🧪 Simple borrow test...");
    
    try {
        // Load deployed contract addresses
        const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/addresses.json')));
        const [deployer, , , borrower1] = await ethers.getSigners();
        
        console.log(`📋 Using borrower1: ${borrower1.address}`);
        
        // Load contracts
        const LiquidityPool = await ethers.getContractAt('LiquidityPool', addresses.LiquidityPool);
        const GlintToken = await ethers.getContractAt('GlintToken', addresses.GlintToken);
        const NullifierRegistry = await ethers.getContractAt('NullifierRegistry', addresses.nullifierRegistry);

        // Get timelock signer for admin operations
        const timelockSigner = await ethers.getImpersonatedSigner(addresses.TimelockController);

        // Fund the timelock with ETH for gas fees
        await deployer.sendTransaction({
            to: addresses.TimelockController,
            value: ethers.parseEther('1')
        });
        console.log(`   ✅ Funded timelock with ETH for gas fees`);
        
        console.log(`\n🔧 Step 1: Setup prerequisites...`);
        
        // 1. Add funds to pool
        const poolBalance = await LiquidityPool.getBalance();
        if (poolBalance < ethers.parseEther('5')) {
            await deployer.sendTransaction({
                to: await LiquidityPool.getAddress(),
                value: ethers.parseEther('10')
            });
            console.log(`   ✅ Added 10 ETH to pool`);
        } else {
            console.log(`   ✅ Pool has sufficient funds: ${ethers.formatEther(poolBalance)} ETH`);
        }
        
        // 2. Set credit score (using timelock)
        const creditScore = await LiquidityPool.creditScore(borrower1.address);
        if (creditScore === 0n) {
            await LiquidityPool.connect(timelockSigner).setCreditScore(borrower1.address, 85);
            console.log(`   ✅ Set credit score to 85`);
        } else {
            console.log(`   ✅ Credit score already set: ${creditScore}`);
        }

        // 3. Allow GLINT as collateral (using timelock)
        const isAllowed = await LiquidityPool.isAllowedCollateral(addresses.GlintToken);
        if (!isAllowed) {
            await LiquidityPool.connect(timelockSigner).setAllowedCollateral(addresses.GlintToken, true);
            console.log(`   ✅ Allowed GLINT as collateral`);
        } else {
            console.log(`   ✅ GLINT already allowed as collateral`);
        }

        // 4. Set price feed (using timelock)
        const priceFeed = await LiquidityPool.priceFeed(addresses.GlintToken);
        if (priceFeed === ethers.ZeroAddress) {
            await LiquidityPool.connect(timelockSigner).setPriceFeed(addresses.GlintToken, addresses.MockPriceFeed);
            console.log(`   ✅ Set price feed for GLINT`);
        } else {
            console.log(`   ✅ Price feed already set: ${priceFeed}`);
        }
        
        // 5. Mint GLINT tokens
        const glintBalance = await GlintToken.balanceOf(borrower1.address);
        if (glintBalance < ethers.parseEther('500')) {
            await GlintToken.connect(deployer).mint(borrower1.address, ethers.parseEther('1000'));
            console.log(`   ✅ Minted 1000 GLINT tokens`);
        } else {
            console.log(`   ✅ Sufficient GLINT balance: ${ethers.formatEther(glintBalance)}`);
        }
        
        // 6. Setup nullifier registry
        try {
            await NullifierRegistry.connect(borrower1).selectAccounts([borrower1.address]);
            console.log(`   ✅ Setup nullifier registry`);
        } catch (error) {
            if (error.message.includes('already selected')) {
                console.log(`   ✅ Nullifier registry already setup`);
            } else {
                console.log(`   ⚠️ Nullifier setup issue: ${error.message}`);
            }
        }
        
        console.log(`\n💰 Step 2: Deposit collateral...`);
        
        // 7. Approve and deposit collateral
        const collateralAmount = ethers.parseEther('500');
        await GlintToken.connect(borrower1).approve(await LiquidityPool.getAddress(), collateralAmount);
        console.log(`   ✅ Approved ${ethers.formatEther(collateralAmount)} GLINT`);
        
        await LiquidityPool.connect(borrower1).depositCollateral(addresses.GlintToken, collateralAmount);
        console.log(`   ✅ Deposited ${ethers.formatEther(collateralAmount)} GLINT as collateral`);
        
        // Check collateral value
        const totalCollateralValue = await LiquidityPool.getTotalCollateralValue(borrower1.address);
        console.log(`   Total collateral value: ${ethers.formatEther(totalCollateralValue)} ETH`);
        
        console.log(`\n🚀 Step 3: Attempt borrow...`);
        
        // 8. Get borrow terms
        const borrowTerms = await LiquidityPool.getBorrowTerms(borrower1.address);
        console.log(`   Collateral ratio required: ${borrowTerms[0]}%`);
        console.log(`   Max loan amount: ${ethers.formatEther(borrowTerms[2])} ETH`);
        
        // 9. Try to borrow
        const borrowAmount = ethers.parseEther('1');
        const nullifier = generateNullifier(1);
        
        console.log(`   Attempting to borrow: ${ethers.formatEther(borrowAmount)} ETH`);
        console.log(`   Using nullifier: ${nullifier}`);
        
        try {
            // First try static call
            await LiquidityPool.connect(borrower1).borrow.staticCall(borrowAmount, nullifier);
            console.log(`   ✅ Static call successful`);
            
            // Then try actual transaction
            const tx = await LiquidityPool.connect(borrower1).borrow(borrowAmount, nullifier);
            await tx.wait();
            console.log(`   ✅ Borrow successful! Hash: ${tx.hash}`);
            
            // Check results
            const debt = await LiquidityPool.userDebt(borrower1.address);
            console.log(`   New debt: ${ethers.formatEther(debt)} ETH`);
            
            const history = await LiquidityPool.getUserHistory(borrower1.address);
            console.log(`   UserHistory: firstInteraction=${history.firstInteractionTimestamp}, payments=${history.succesfullPayments}, liquidations=${history.liquidations}`);
            
            console.log(`\n🎉 Test completed successfully!`);
            
        } catch (error) {
            console.log(`   ❌ Borrow failed: ${error.message}`);
            
            // Try smaller amount
            const smallerAmount = ethers.parseEther('0.5');
            console.log(`\n   Trying smaller amount: ${ethers.formatEther(smallerAmount)} ETH`);
            
            try {
                const nullifier2 = generateNullifier(2);
                await LiquidityPool.connect(borrower1).borrow.staticCall(smallerAmount, nullifier2);
                console.log(`   ✅ Static call successful for smaller amount`);
                
                const tx = await LiquidityPool.connect(borrower1).borrow(smallerAmount, nullifier2);
                await tx.wait();
                console.log(`   ✅ Smaller borrow successful! Hash: ${tx.hash}`);
                
                const debt = await LiquidityPool.userDebt(borrower1.address);
                console.log(`   New debt: ${ethers.formatEther(debt)} ETH`);
                
            } catch (smallerError) {
                console.log(`   ❌ Even smaller amount failed: ${smallerError.message}`);
                throw smallerError;
            }
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
}

main()
    .then(() => {
        console.log("\n✅ Simple borrow test completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Test error:", error);
        process.exit(1);
    });
