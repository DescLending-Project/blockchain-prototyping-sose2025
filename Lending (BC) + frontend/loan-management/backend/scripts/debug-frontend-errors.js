const { ethers } = require("hardhat");

// Your contract addresses - UPDATE THESE
const CREDIT_SYSTEM_ADDRESS = "0xb15E1266e76d1353dC73D46c1F4a39ccf430082B"; // Update
const RISC0_TEST_ADDRESS = "0x04C89607413713Ec9775E14b954286519d836FEf"; // Update

async function debugFrontendError() {
    console.log("🔍 Debug Frontend Proof Submission Error");
    console.log("=" .repeat(50));
    
    const [deployer, user] = await ethers.getSigners();
    console.log("User address:", user.address);
    
    const creditSystem = await ethers.getContractAt("IntegratedCreditSystem", CREDIT_SYSTEM_ADDRESS);
    const risc0Test = await ethers.getContractAt("SimpleRISC0Test", RISC0_TEST_ADDRESS);
    
    // Step 1: Check if demo mode is enabled
    console.log("\n1️⃣ Checking Demo Mode Status:");
    try {
        const isDemoMode = await risc0Test.isDemoMode();
        console.log("Demo mode enabled:", isDemoMode);
        
        if (!isDemoMode) {
            console.log("❌ ISSUE FOUND: Demo mode is disabled!");
            console.log("🔧 Enabling demo mode...");
            
            // Try to enable demo mode
            try {
                const tx = await risc0Test.setDemoMode(true);
                await tx.wait();
                console.log("✅ Demo mode enabled successfully");
            } catch (error) {
                console.log("❌ Failed to enable demo mode:", error.message);
                console.log("💡 You might not be the owner. Run this script with the deployer account.");
            }
        } else {
            console.log("✅ Demo mode is enabled");
        }
    } catch (error) {
        console.log("❌ Failed to check demo mode:", error.message);
    }
    
    // Step 2: Check credit system connection
    console.log("\n2️⃣ Checking Credit System Connection:");
    try {
        const risc0Verifier = await creditSystem.risc0Verifier();
        console.log("Credit system's RISC0 verifier:", risc0Verifier);
        console.log("Expected RISC0 verifier:        ", RISC0_TEST_ADDRESS);
        
        if (risc0Verifier.toLowerCase() === RISC0_TEST_ADDRESS.toLowerCase()) {
            console.log("✅ Credit system is connected to correct RISC0 verifier");
        } else {
            console.log("❌ ISSUE FOUND: Credit system connected to wrong verifier!");
        }
    } catch (error) {
        console.log("❌ Failed to check connection:", error.message);
    }
    
    // Step 3: Test with simple mock proof
    console.log("\n3️⃣ Testing Simple Mock Proof:");
    try {
        // Create a simple mock seal that should work in demo mode
        const mockSeal = ethers.toUtf8Bytes(`MOCK_ACCOUNT_SEAL_${user.address}_${Date.now()}`);
        
        // Create simple journal data
        const mockJournal = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "uint256", "bytes32", "bytes32", "uint256", "bytes32"],
            [
                user.address,
                150, // nonce
                ethers.parseEther("2.5"), // balance
                "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421", // storageRoot
                "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470", // codeHash
                123456, // blockNumber
                "0xe717d168d366b01f6edddc3554333c5b63afaedb34edd210f425b7334c251764" // stateRoot
            ]
        );
        
        console.log("Mock seal length:", mockSeal.length);
        console.log("Mock journal length:", mockJournal.length);
        console.log("Seal preview:", ethers.toUtf8String(mockSeal.slice(0, 30)));
        
        // Try submitting directly to credit system
        console.log("\n🧪 Testing direct submission to credit system...");
        
        // First estimate gas to see where it fails
        try {
            const gasEstimate = await creditSystem.submitAccountProof.estimateGas(mockSeal, mockJournal, {
                from: user.address
            });
            console.log("✅ Gas estimation successful:", gasEstimate.toString());
            
            // If gas estimation works, try the actual call
            console.log("🚀 Attempting actual submission...");
            const tx = await creditSystem.connect(user).submitAccountProof(mockSeal, mockJournal);
            await tx.wait();
            console.log("✅ SUCCESS: Mock proof submitted successfully!");
            
        } catch (gasError) {
            console.log("❌ Gas estimation failed:", gasError.message);
            
            // Try to understand why by testing RISC0Test directly
            console.log("\n🔍 Testing RISC0Test directly...");
            try {
                const directTx = await risc0Test.connect(user).testAccountProof(mockSeal, mockJournal);
                await directTx.wait();
                console.log("✅ RISC0Test direct submission worked");
                console.log("💡 Issue might be in IntegratedCreditSystem, not RISC0Test");
            } catch (directError) {
                console.log("❌ RISC0Test direct submission failed:", directError.message);
                
                // Check if the issue is with mock proof format
                if (directError.message.includes("Unknown error")) {
                    console.log("💡 The mock proof format might be incorrect");
                    console.log("💡 Check if the seal starts with 'MOCK_ACCOUNT_SEAL_'");
                }
            }
        }
    } catch (error) {
        console.log("❌ Mock proof test failed:", error.message);
    }
    
    // Step 4: Check current user status
    console.log("\n4️⃣ Checking User Status:");
    try {
        const profile = await creditSystem.getUserCreditProfile(user.address);
        console.log("Current credit score:", profile.finalScore.toString());
        console.log("Has account verified:", profile.hasAccount);
        console.log("Is eligible:", profile.isEligible);
    } catch (error) {
        console.log("❌ Failed to get user profile:", error.message);
    }
    
    // Step 5: Provide specific frontend fix
    console.log("\n📋 FRONTEND DEBUGGING CHECKLIST:");
    console.log("=" .repeat(50));
    console.log("1. ✅ Verify demo mode is enabled on contracts");
    console.log("2. 🔍 Check if the .bin file is being read correctly");
    console.log("3. 🔍 Verify the journal data format matches expected ABI encoding");
    console.log("4. 🔍 Ensure the credit system address is correct in frontend");
    console.log("5. 🔍 Check if the user's MetaMask account matches the journal data");
    
    console.log("\n🎯 MOST LIKELY ISSUES:");
    console.log("- Demo mode is disabled (check step 1 above)");
    console.log("- Mock seal doesn't start with 'MOCK_ACCOUNT_SEAL_'");
    console.log("- Journal data format doesn't match ABI encoding");
    console.log("- Wrong credit system contract address");
    console.log("- User address in journal doesn't match MetaMask account");
    
    console.log("\n💡 QUICK FIXES:");
    console.log("1. Enable demo mode: await risc0Test.setDemoMode(true)");
    console.log("2. Use DemoTester to generate proper mock receipts");
    console.log("3. Ensure seal starts with 'MOCK_ACCOUNT_SEAL_'");
    console.log("4. Match user address in journal with current MetaMask account");
}

if (require.main === module) {
    debugFrontendError().catch(console.error);
}

module.exports = { debugFrontendError };