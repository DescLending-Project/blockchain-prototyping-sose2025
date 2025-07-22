// Quick fix script to test and resolve demo issues
const { ethers } = require("hardhat");

async function quickFixDemo() {
    console.log("🛠️  Quick Fix: Testing and resolving demo issues");
    
    // Use the deployed contract addresses from demo
    const addresses = {
        liquidityPool: "0xD8a5a9b31c3C0232E196d518E89Fd8bF83AcAd43",
        creditSystem: "0x8198f5d8F8CfFE8f9C413d98a0A55aEB8ab9FbB7",
        risc0Test: "0x04C89607413713Ec9775E14b954286519d836FEf",
        demoTester: "0x202CCe504e04bEd6fC0521238dDf04Bc9E8E15aB"
    };
    
    const demoTester = await ethers.getContractAt("DemoTester", addresses.demoTester);
    const creditSystem = await ethers.getContractAt("IntegratedCreditSystem", addresses.creditSystem);
    const risc0Test = await ethers.getContractAt("SimpleRISC0Test", addresses.risc0Test);
    const liquidityPool = await ethers.getContractAt("LiquidityPoolV3", addresses.liquidityPool);
    
    const [deployer, user] = await ethers.getSigners();
    
    console.log("🔧 Step 1: Verify demo mode is active");
    const isDemoMode = await risc0Test.isDemoMode();
    console.log("Demo mode:", isDemoMode);
    
    if (!isDemoMode) {
        console.log("Enabling demo mode...");
        await risc0Test.setDemoMode(true);
        console.log("✅ Demo mode enabled");
    }
    
    console.log("\n🔧 Step 2: Test individual proof submissions");
    
    // Test Account Proof
    try {
        console.log("Testing account proof...");
        const [accountSeal, accountJournal] = await demoTester.generateAccountProof();
        console.log("Generated account seal:", accountSeal.slice(0, 50) + "...");
        
        const tx1 = await risc0Test.connect(user).testAccountProof(accountSeal, accountJournal);
        await tx1.wait();
        console.log("✅ Account proof submission successful");
        
        // Submit to credit system
        const tx1b = await creditSystem.connect(user).submitAccountProof(accountSeal, accountJournal);
        await tx1b.wait();
        console.log("✅ Account proof submitted to credit system");
        
    } catch (error) {
        console.log("❌ Account proof failed:", error.message);
    }
    
    // Test TradFi Proof
    try {
        console.log("\nTesting TradFi proof...");
        const [tradfiSeal, tradfiJournal] = await demoTester.generateTradFiProof(750);
        console.log("Generated TradFi seal:", tradfiSeal.slice(0, 50) + "...");
        
        const tx2 = await risc0Test.connect(user).testTradFiProof(tradfiSeal, tradfiJournal);
        await tx2.wait();
        console.log("✅ TradFi proof submission successful");
        
        // Submit to credit system
        const tx2b = await creditSystem.connect(user).submitTradFiProof(tradfiSeal, tradfiJournal);
        await tx2b.wait();
        console.log("✅ TradFi proof submitted to credit system");
        
    } catch (error) {
        console.log("❌ TradFi proof failed:", error.message);
    }
    
    // Test Nesting Proof
    try {
        console.log("\nTesting nesting proof...");
        const [nestingSeal, nestingJournal] = await demoTester.generateNestingProof(750);
        console.log("Generated nesting seal:", nestingSeal.slice(0, 50) + "...");
        
        const tx3 = await risc0Test.connect(user).testNestingProof(nestingSeal, nestingJournal);
        await tx3.wait();
        console.log("✅ Nesting proof submission successful");
        
        // Submit to credit system
        const tx3b = await creditSystem.connect(user).submitNestingProof(nestingSeal, nestingJournal);
        await tx3b.wait();
        console.log("✅ Nesting proof submitted to credit system");
        
    } catch (error) {
        console.log("❌ Nesting proof failed:", error.message);
    }
    
    console.log("\n🔧 Step 3: Check credit status after manual submissions");
    try {
        const profile = await creditSystem.getUserCreditProfile(user.address);
        console.log("Updated credit profile:");
        console.log("- Has TradFi verification:", profile[0]);
        console.log("- Has Account verification:", profile[1]);
        console.log("- Has Nesting verification:", profile[2]);
        console.log("- Final credit score:", profile[3].toString());
        console.log("- Eligible to borrow:", profile[4]);
        
        if (profile[4]) { // isEligible
            console.log("\n🔧 Step 4: Deposit collateral and test borrowing");
            try {
                const collateralAmount = ethers.parseEther("2");
                
                // Check if ETH is allowed collateral , address(0) represents ETH
                const ethAllowed = await liquidityPool.isAllowedCollateral(ethers.ZeroAddress);
                console.log("ETH allowed as collateral:", ethAllowed);
                
                if (!ethAllowed) {
                    console.log("Setting ETH as allowed collateral...");
                    try {
                        await liquidityPool.setAllowedCollateral(ethers.ZeroAddress, true);
                        console.log("✅ ETH set as allowed collateral");
                    } catch (error) {
                        console.log("⚠️  Could not set ETH as collateral (not owner)");
                    }
                }
                
                // test multiple ways to deposit collateral
                console.log("Attempting to deposit", ethers.formatEther(collateralAmount), "ETH as collateral...");
                
                try {
                    const depositTx = await liquidityPool.connect(user).depositCollateral(ethers.ZeroAddress, collateralAmount, {
                        value: collateralAmount
                    });
                    await depositTx.wait();
                    console.log("✅ Collateral deposited using depositCollateral function");
                } catch (error1) {
                    console.log("Method 1 failed, trying direct ETH send...");
                    try {
                        // Method 2 Direct ETH send to contract (added this during testing, one of the methods is not correct)
                        const directTx = await user.sendTransaction({
                            to: await liquidityPool.getAddress(),
                            value: collateralAmount
                        });
                        await directTx.wait();
                        console.log("✅ ETH sent directly to contract");
                    } catch (error2) {
                        console.log("❌ Both deposit methods failed");
                        console.log("Error 1:", error1.message);
                        console.log("Error 2:", error2.message);
                        return;
                    }
                }
                
                const collateralBalance = await liquidityPool.getCollateral(user.address, ethers.ZeroAddress);
                console.log("Collateral balance:", ethers.formatEther(collateralBalance), "ETH");
                
                if (collateralBalance.toString() === "0") {
                    console.log("❌ Collateral balance is still 0 - investigating...");
                    
                    const contractBalance = await liquidityPool.getBalance();
                    console.log("Contract total balance:", ethers.formatEther(contractBalance), "ETH");
                    
                    console.log("Trying alternative ETH representations...");
                    
                    const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // alt. ETH address
                    try {
                        await liquidityPool.setAllowedCollateral(ethAddress, true);
                        await liquidityPool.connect(user).depositCollateral(ethAddress, collateralAmount, {
                            value: collateralAmount
                        });
                        const altBalance = await liquidityPool.getCollateral(user.address, ethAddress);
                        console.log("Alternative ETH collateral balance:", ethers.formatEther(altBalance), "ETH");
                    } catch (error) {
                        console.log("Alternative ETH address also failed");
                    }
                    
                    return;
                }
                
                const borrowAmount = ethers.parseEther("0.5");
                console.log("Attempting to borrow", ethers.formatEther(borrowAmount), "ETH...");
                const tx4 = await liquidityPool.connect(user).borrow(borrowAmount);
                await tx4.wait();
                console.log("✅ Borrowing successful!");
                
                const debt = await liquidityPool.userDebt(user.address);
                console.log("Current debt:", ethers.formatEther(debt), "ETH");
                
            } catch (error) {
                console.log("❌ Borrowing process failed:", error.message);
                
                // debug
                try {
                    const totalCollateral = await liquidityPool.getTotalCollateralValue(user.address);
                    console.log("Total collateral value:", totalCollateral.toString());
                    
                    const [collateralRatio, , maxLoan] = await liquidityPool.getBorrowTerms(user.address);
                    console.log("Required collateral ratio:", collateralRatio.toString(), "%");
                    console.log("Max loan amount:", ethers.formatEther(maxLoan), "ETH");
                    
                } catch (debugError) {
                    console.log("Could not get debug info:", debugError.message);
                }
            }
        } else {
            console.log("❌ User still not eligible to borrow");
            console.log("Need at least one more proof type to succeed");
        }
        
    } catch (error) {
        console.log("❌ Error checking credit profile:", error.message);
    }
    
    console.log(" Quick fix is complete");
}

async function main() {
    await quickFixDemo();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { quickFixDemo };