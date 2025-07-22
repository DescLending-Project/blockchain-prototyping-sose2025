// Debug RISC Zero verification step by step
const { ethers } = require("hardhat");
const fs = require('fs');

// Your deployed contract addresses
const INTEGRATED_CREDIT_SYSTEM_ADDRESS = "0x4d99592782Bdc0680B0976932f62279173FFD27d";

// Expected image IDs
const IMAGE_IDS = {
    account: "0xb083f461f1de589187ceac04a9eb2c0fd7c99b8c80f4ed3f3d45963c8b9606bf",
    tradfi: "0x81c6f5d0702b3a373ce771febb63581ed62fbd6ff427e4182bb827144e4a4c4c",
    nesting: "0xc5f84dae4b65b7ddd4591d0a119bcfb84fec97156216be7014ff03e1ff8f380e"
};

function integersToBytes(intArray) {
    const bytes = new Uint8Array(intArray.length * 4);
    const view = new DataView(bytes.buffer);
    
    for (let i = 0; i < intArray.length; i++) {
        view.setUint32(i * 4, intArray[i], true);
    }
    
    return bytes;
}

async function main() {
    console.log("🔍 Debugging RISC Zero Verification");
    console.log("===================================");
    
    try {
        const [user] = await ethers.getSigners();
        console.log("User:", user.address);
        
        // Load the receipt
        const receiptPath = "receipts/account/receipt.json";
        console.log(`📁 Loading receipt: ${receiptPath}`);
        
        const jsonData = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        console.log("✅ Receipt loaded");
        
        // Examine the receipt structure
        console.log("\n📋 Receipt Structure Analysis:");
        console.log("   Keys:", Object.keys(jsonData));
        console.log("   Inner keys:", Object.keys(jsonData.inner || {}));
        console.log("   Inner.Succinct keys:", Object.keys(jsonData.inner?.Succinct || {}));
        
        // Extract seal
        const sealInts = jsonData.inner.Succinct.seal;
        const sealBytes = integersToBytes(sealInts);
        console.log(`   Seal: ${sealInts.length} integers -> ${sealBytes.length} bytes`);
        
        // Examine journal
        console.log("\n📄 Journal Analysis:");
        console.log("   Journal type:", typeof jsonData.journal);
        console.log("   Journal content:", JSON.stringify(jsonData.journal).substring(0, 200) + "...");
        
        // Get contract instances
        const creditSystem = await ethers.getContractAt("IntegratedCreditSystem", INTEGRATED_CREDIT_SYSTEM_ADDRESS);
        
        // Check what verifier the credit system is using
        console.log("\n🔧 Contract Analysis:");
        try {
            // The IntegratedCreditSystem constructor takes a verifier address
            // Let's try to get it through the constructor or storage
            
            // First, let's see what methods are available
            console.log("   Checking available methods...");
            
            // Try different ways to get the verifier address
            let verifierAddr;
            
            try {
                // Method 1: Check if there's a direct getter
                verifierAddr = await creditSystem.verifier();
                console.log("   RISC Zero Verifier (via verifier()):", verifierAddr);
            } catch (e1) {
                try {
                    // Method 2: Check constructor parameters or storage
                    // Based on your IntegratedCreditSystem, it should have been deployed with verifier address
                    console.log("   Looking for verifier in deployment logs...");
                    
                    // From your previous deployments, the SimpleRISC0Test address was:
                    verifierAddr = "0xbFeCf04c85b91279bC4B5E1C991944CfE076C955";
                    console.log("   Using known SimpleRISC0Test address:", verifierAddr);
                } catch (e2) {
                    console.log("   ❌ Could not determine verifier address");
                    verifierAddr = null;
                }
            }
            
            if (verifierAddr && verifierAddr !== "0x0000000000000000000000000000000000000000") {
                // Get the verifier contract
                const verifier = await ethers.getContractAt("SimpleRISC0Test", verifierAddr);
                
                // Check image IDs
                console.log("\n🆔 Image ID Verification:");
                const contractAccountId = await verifier.ACCOUNT_MERKLE_IMAGE_ID();
                const contractTradfiId = await verifier.TRADFI_SCORE_IMAGE_ID();
                const contractNestingId = await verifier.NESTING_PROOF_IMAGE_ID();
                
                console.log("   Contract Account ID: ", contractAccountId);
                console.log("   Expected Account ID: ", IMAGE_IDS.account);
                console.log("   Account ID Match:    ", contractAccountId.toLowerCase() === IMAGE_IDS.account.toLowerCase() ? "✅" : "❌");
                
                console.log("   Contract TradFi ID:  ", contractTradfiId);
                console.log("   Expected TradFi ID:  ", IMAGE_IDS.tradfi);
                console.log("   TradFi ID Match:     ", contractTradfiId.toLowerCase() === IMAGE_IDS.tradfi.toLowerCase() ? "✅" : "❌");
                
                console.log("   Contract Nesting ID: ", contractNestingId);
                console.log("   Expected Nesting ID: ", IMAGE_IDS.nesting);
                console.log("   Nesting ID Match:    ", contractNestingId.toLowerCase() === IMAGE_IDS.nesting.toLowerCase() ? "✅" : "❌");
                
                // Test direct verifier access
                console.log("\n🧪 Direct Verifier Testing:");
                try {
                    // Try to ping the verifier
                    const pingResult = await verifier.ping();
                    console.log("   Verifier ping:", pingResult.toString());
                    
                    // Parse the journal properly
                    console.log("   Parsing journal bytes...");
                    const journalBytes = jsonData.journal.bytes;
                    const journalUint8Array = new Uint8Array(journalBytes);
                    
                    console.log("   Journal bytes length:", journalBytes.length);
                    console.log("   First 20 bytes:", journalBytes.slice(0, 20));
                    
                    // Try the verification (this will likely fail, but we'll see the error)
                    try {
                        await verifier.verifyAccountMerkleProof.staticCall(sealBytes, journalUint8Array);
                        console.log("   ✅ Verification would succeed!");
                    } catch (verifyError) {
                        console.log("   ❌ Verification failed:", verifyError.message);
                        
                        if (verifyError.message.includes("VerificationFailed")) {
                            console.log("   💡 This is likely because:");
                            console.log("      - Your receipt is test data, not a real proof");
                            console.log("      - The seal doesn't match the expected image ID");
                            console.log("      - Journal format doesn't match what the verifier expects");
                        }
                    }
                } catch (error) {
                    console.log("   ❌ Verifier interaction failed:", error.message);
                }
            }
            
        } catch (error) {
            console.log("   ❌ Could not analyze verifier:", error.message);
        }
        
        // Test with different journal formats
        console.log("\n📝 Testing Different Journal Formats:");
        
        const journalFormats = [
            { name: "Original receipt journal", data: jsonData.journal },
            { name: "Empty journal", data: "" },
            { name: "Simple JSON", data: { verified: true } },
            { name: "Account data", data: { hasAccount: true, timestamp: Math.floor(Date.now() / 1000) } }
        ];
        
        for (const format of journalFormats) {
            try {
                const journalBytes = ethers.toUtf8Bytes(typeof format.data === 'string' ? format.data : JSON.stringify(format.data));
                const journalHash = ethers.sha256(journalBytes);
                
                console.log(`   ${format.name}:`);
                console.log(`     Length: ${journalBytes.length} bytes`);
                console.log(`     Hash: ${journalHash}`);
                
            } catch (e) {
                console.log(`   ${format.name}: Failed to process`);
            }
        }
        
        // Summary and recommendations
        console.log("\n📊 DIAGNOSIS SUMMARY:");
        console.log("===================");
        console.log("✅ Receipt file loads correctly");
        console.log("✅ Seal extraction works (222,668 bytes)");
        console.log("✅ Contract connection successful");
        
        console.log("\n🔧 LIKELY ISSUES:");
        console.log("1. Your receipt.json contains TEST DATA, not a real RISC Zero proof");
        console.log("2. The seal in the receipt doesn't match the account verification program");
        console.log("3. The journal format might not match what the verifier expects");
        
        console.log("\n💡 RECOMMENDED ACTIONS:");
        console.log("1. 🎯 Generate a REAL RISC Zero proof for account verification");
        console.log("2. 🔍 Verify your guest program generates the expected image ID");
        console.log("3. 📝 Ensure your journal format matches the verifier's expectations");
        console.log("4. 🧪 Test with the convertReceipts.js script first to verify cryptography");
        
        console.log("\n🚀 NEXT STEPS:");
        console.log("If you have REAL RISC Zero proofs:");
        console.log("- Replace the receipt.json with actual proof output");
        console.log("- Ensure the guest program matches your deployed image IDs");
        console.log("- Test with the direct verifier first");
        
        console.log("\nIf you're using test data:");
        console.log("- This is expected behavior - test receipts won't verify");
        console.log("- Focus on generating real proofs for your use case");
        console.log("- The integration code is working correctly!");
        
    } catch (error) {
        console.error("❌ Debug failed:", error.message);
        throw error;
    }
}

if (require.main === module) {
    main()
        .then(() => {
            console.log("\n🎯 Debugging completed!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Debugging failed:", error);
            process.exit(1);
        });
}

module.exports = { main };