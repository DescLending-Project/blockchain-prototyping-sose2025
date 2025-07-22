// Final working demo that fixes the msg.sender mismatch issue
const { ethers } = require("hardhat");

async function finalWorkingDemo() {
    console.log("🎯 Final Working Demo - Direct Proof Submission");

    // Use the deployed contract addresses from your output
    const addresses = {
        liquidityPool: "0xf953b3A269d80e3eB0F2947630Da976B896A8C5b",
        creditSystem: "0xe8D2A1E88c91DCd5433208d4152Cc4F399a7e91d",
        risc0Test: "0x4C2F7092C2aE51D986bEFEe378e50BD4dB99C901",
        demoTester: "0x18E317A7D70d8fBf8e6E893616b52390EbBdb629",
        glintToken: "0x7A9Ec1d04904907De0ED7b6839CcdD59c3716AC9"
    };

    const demoTester = await ethers.getContractAt("DemoTester", addresses.demoTester);
    const creditSystem = await ethers.getContractAt("IntegratedCreditSystem", addresses.creditSystem);
    const risc0Test = await ethers.getContractAt("SimpleRISC0Test", addresses.risc0Test);
    const liquidityPool = await ethers.getContractAt("LiquidityPool", addresses.liquidityPool);
    const glintToken = await ethers.getContractAt("GlintToken", addresses.glintToken);

    const [deployer, user] = await ethers.getSigners();

    console.log("User:", user.address);
    console.log("💰 User GLINT balance:", ethers.formatUnits(await glintToken.balanceOf(user.address), 18), "GLINT");

    console.log("\n💳 Step 1: Setup collateral");
    const collateralAmount = ethers.parseUnits("2000", 18);

    const userGlintBalance = await glintToken.balanceOf(user.address);
    if (userGlintBalance < collateralAmount) {
        console.log("User needs more GLINT, transferring from deployer...");
        await glintToken.transfer(user.address, collateralAmount);
        console.log("✅ Transferred additional GLINT to user");
    }

    // Approve and deposit collateral
    await glintToken.connect(user).approve(addresses.liquidityPool, collateralAmount);
    await liquidityPool.connect(user).depositCollateral(addresses.glintToken, collateralAmount);
    console.log("✅ Deposited", ethers.formatUnits(collateralAmount, 18), "GLINT as collateral");

    // Verify collateral
    const collateralBalance = await liquidityPool.getCollateral(user.address, addresses.glintToken);
    console.log("Collateral balance:", ethers.formatUnits(collateralBalance, 18), "GLINT");

    // Step 2: Generate proofs using DemoTester (but submit directly)
    console.log("\n🔐 Step 2: Generate and submit ZK proofs");

    try {
        console.log("Generating account proof...");
        const [accountSeal, accountJournal] = await demoTester.connect(user).generateAccountProof();

        console.log("Generating TradFi proof...");
        const [tradfiSeal, tradfiJournal] = await demoTester.connect(user).generateTradFiProof(750);

        console.log("Generating nesting proof...");
        const [nestingSeal, nestingJournal] = await demoTester.connect(user).generateNestingProof(750);

        console.log("✅ All proofs generated successfully");

        // Submit proofs directly from user to avoid msg.sender mismatch
        console.log("\nSubmitting proofs directly from user...");

        // Submit account proof
        console.log("Submitting account proof...");
        const tx1 = await creditSystem.connect(user).submitAccountProof(accountSeal, accountJournal);
        await tx1.wait();
        console.log("✅ Account proof submitted successfully");

        // Submit TradFi proof
        console.log("Submitting TradFi proof...");
        const tx2 = await creditSystem.connect(user).submitTradFiProof(tradfiSeal, tradfiJournal);
        await tx2.wait();
        console.log("✅ TradFi proof submitted successfully");

        // Submit nesting proof
        console.log("Submitting nesting proof...");
        const tx3 = await creditSystem.connect(user).submitNestingProof(nestingSeal, nestingJournal);
        await tx3.wait();
        console.log("✅ Nesting proof submitted successfully");

    } catch (error) {
        console.log("❌ Proof submission failed:", error.message);

        // Debug: what is in proofs
        console.log("\nDebugging proof contents...");
        try {
            const [accountSeal, accountJournal] = await demoTester.connect(user).generateAccountProof();

            // Decode journal to see inside
            const accountProofTypes = ["address", "uint256", "uint256", "bytes32", "bytes32", "uint256", "bytes32"];
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(accountProofTypes, accountJournal);
            console.log("Account proof address:", decoded[0]);
            console.log("User address:", user.address);
            console.log("Addresses match:", decoded[0].toLowerCase() === user.address.toLowerCase());

        } catch (debugError) {
            console.log("Debug failed:", debugError.message);
        }

        return;
    }

    // credit profile check
    console.log("\n📊 Step 3: Check credit profile");
    const profile = await creditSystem.getUserCreditProfile(user.address);
    console.log("Credit profile:");
    console.log("- Has TradFi verification:", profile[0]);
    console.log("- Has Account verification:", profile[1]);
    console.log("- Has Nesting verification:", profile[2]);
    console.log("- Final credit score:", profile[3].toString());
    console.log("- Eligible to borrow:", profile[4]);

    if (!profile[4]) {
        console.log("❌ User not eligible to borrow after proof submissions");

        // individual scores
        try {
            const details = await creditSystem.getDetailedVerificationStatus(user.address);
            console.log("Detailed scores:");
            console.log("- TradFi score:", details[0].toString());
            console.log("- Account score:", details[1].toString());
            console.log("- Hybrid score:", details[2].toString());
        } catch (error) {
            console.log("Could not get detailed scores:", error.message);
        }

        return;
    }

    // Check collateral value and requirements
    console.log("\n💰 Step 4: Check borrowing requirements");
    const totalCollateralValue = await liquidityPool.getTotalCollateralValue(user.address);
    const [collateralRatio, interestMod, maxLoan] = await liquidityPool.getBorrowTerms(user.address);

    console.log("Borrowing analysis:");
    console.log("- Total collateral value:", totalCollateralValue.toString(), "USD scaled");
    console.log("- Required collateral ratio:", collateralRatio.toString() + "%");
    console.log("- Max loan amount:", ethers.formatEther(maxLoan), "ETH");

    //Attempt to borrow
    console.log("\n🏦 Step 5: Attempt borrowing");
    const borrowAmount = ethers.parseEther("0.5"); // smaller amount first
    console.log("Attempting to borrow:", ethers.formatEther(borrowAmount), "ETH");

    try {
        const borrowTx = await liquidityPool.connect(user).borrow(borrowAmount);
        await borrowTx.wait();
        console.log("✅ Borrowing successful!");

        // Check final state
        const debt = await liquidityPool.userDebt(user.address);
        const newBalance = await user.provider.getBalance(user.address);

        console.log("Success - Complete ZK Lending Demo!");
        console.log("Final results:");
        console.log("- User debt:", ethers.formatEther(debt), "ETH");
        console.log("- User ETH balance:", ethers.formatEther(newBalance), "ETH");
        console.log("- Collateral deposited:", ethers.formatUnits(collateralBalance, 18), "GLINT");

        console.log("\n✅ COMPLETE ZK-POWERED LENDING SYSTEM WORKING!");
        console.log("✅ Identity verified via ZK account proof");
        console.log("✅ Credit score calculated via TradFi data proof");
        console.log("✅ Hybrid scoring via nesting proof");
        console.log("✅ ERC20 collateral deposited and valued");
        console.log("✅ Loan approved and disbursed based on ZK verification");

    } catch (error) {
        console.log("❌ Borrowing failed:", error.message);

        // Detailed debug
        console.log("\nDetailed borrowing debug:");
        console.log("- Collateral value (raw):", totalCollateralValue.toString());
        console.log("- Borrow amount:", ethers.formatEther(borrowAmount), "ETH");
        console.log("- Required ratio:", collateralRatio.toString() + "%");

        // Calculate required collateral
        const requiredCollateral = borrowAmount.mul(collateralRatio).div(100);
        console.log("- Required collateral value:", ethers.formatEther(requiredCollateral), "ETH equivalent");

        // Check if it's a collateral issue vs other issue
        if (totalCollateralValue.toString() === "0") {
            console.log("🔧 Issue: Collateral value is 0 - price feed problem");
        } else {
            console.log("🔧 Issue: Likely insufficient collateral ratio");
        }
    }
}

async function main() {
    try {
        await finalWorkingDemo();
    } catch (error) {
        console.error("❌ Demo failed:", error);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { finalWorkingDemo };