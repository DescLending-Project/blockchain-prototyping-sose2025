// Test the IntegratedCreditSystem with proper error handling and debugging
const { ethers } = require("hardhat");
const fs = require('fs');

const INTEGRATED_CREDIT_SYSTEM_ADDRESS = "0x4d99592782Bdc0680B0976932f62279173FFD27d";

function integersToBytes(intArray) {
    const bytes = new Uint8Array(intArray.length * 4);
    const view = new DataView(bytes.buffer);
    
    for (let i = 0; i < intArray.length; i++) {
        view.setUint32(i * 4, intArray[i], true);
    }
    
    return bytes;
}

async function main() {
    console.log("🔗 Testing IntegratedCreditSystem Integration");
    console.log("============================================");
    
    try {
        const [user] = await ethers.getSigners();
        console.log("User:", user.address);
        
        // Load receipt
        const receiptPath = "receipts/account/receipt.json";
        const jsonData = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        
        const sealInts = jsonData.inner.Succinct.seal;
        const sealBytes = integersToBytes(sealInts);
        const journalBytesArray = jsonData.journal.bytes;
        const journalBytes = new Uint8Array(journalBytesArray);
        
        console.log(`📁 Receipt loaded: ${sealBytes.length} byte seal, ${journalBytes.length} byte journal`);
        
        // Connect to credit system
        const creditSystem = await ethers.getContractAt("IntegratedCreditSystem", INTEGRATED_CREDIT_SYSTEM_ADDRESS);
        
        // Check initial state
        console.log("\n📊 Initial State:");
        const initialProfile = await creditSystem.getUserCreditProfile(user.address);
        console.log("   Credit Score:", initialProfile.finalScore.toString());
        console.log("   Has Account:", initialProfile.hasAccount);
        console.log("   Borrowing Eligible:", initialProfile.isEligible);
        
        // Get the verifier address to test direct calls
        console.log("\n🔧 Analyzing Contract Setup:");
        try {
            // The risc0Verifier is a public immutable, so we can read it
            const verifierAddress = await creditSystem.risc0Verifier();
            console.log("   RISC Zero Verifier:", verifierAddress);
            
            const verifier = await ethers.getContractAt("SimpleRISC0Test", verifierAddress);
            const pingResult = await verifier.ping();
            console.log("   Verifier ping:", pingResult.toString());
            
        } catch (e) {
            console.log("   ❌ Could not analyze verifier setup:", e.message);
        }
        
        // Test different journal formats to find what works
        console.log("\n🧪 Testing Journal Format Variations:");
        
        const journalVariations = [
            {
                name: "Original bytes from receipt",
                data: journalBytes,
                description: "Raw bytes from receipt.json"
            },
            {
                name: "JSON string format",
                data: ethers.toUtf8Bytes(JSON.stringify({
                    hasAccount: true,
                    accountAge: 5,
                    transactionCount: 100,
                    timestamp: Math.floor(Date.now() / 1000)
                })),
                description: "Structured JSON data"
            },
            {
                name: "Empty journal",
                data: new Uint8Array(0),
                description: "No journal data"
            },
            {
                name: "Minimal bytes",
                data: new Uint8Array([1, 0, 0, 0]),
                description: "4-byte minimal data"
            }
        ];
        
        let successfulFormat = null;
        
        for (const variation of journalVariations) {
            console.log(`\n   Testing: ${variation.name} (${variation.data.length} bytes)`);
            console.log(`   Description: ${variation.description}`);
            
            try {
                // Use staticCall to test without spending gas
                console.log("      Calling submitAccountProof.staticCall...");
                await creditSystem.submitAccountProof.staticCall(sealBytes, variation.data);
                
                console.log("      ✅ Static call succeeded!");
                successfulFormat = variation;
                
                // If static call worked, try the real transaction
                console.log("      📤 Sending actual transaction...");
                const tx = await creditSystem.submitAccountProof(sealBytes, variation.data);
                console.log(`      Transaction hash: ${tx.hash}`);
                
                const receipt = await tx.wait();
                console.log(`      ✅ Transaction confirmed in block: ${receipt.blockNumber}`);
                console.log(`      Gas used: ${receipt.gasUsed.toString()}`);
                
                // Check if any events were emitted
                if (receipt.logs && receipt.logs.length > 0) {
                    console.log(`      📊 ${receipt.logs.length} events emitted`);
                    
                    // Try to parse events
                    for (const log of receipt.logs) {
                        try {
                            const parsedLog = creditSystem.interface.parseLog(log);
                            console.log(`         Event: ${parsedLog.name}`);
                            console.log(`         Args:`, parsedLog.args);
                        } catch (e) {
                            console.log(`         Raw log: ${log.topics[0]}`);
                        }
                    }
                }
                
                break; // Success! Stop testing other formats
                
            } catch (error) {
                console.log(`      ❌ Failed: ${error.message}`);
                
                // Analyze the error
                if (error.message.includes("Account verification failed: Unknown error")) {
                    console.log("         💡 This is the error from your contract's try/catch block");
                    console.log("         💡 The underlying verification is failing");
                } else if (error.message.includes("VerificationFailed")) {
                    console.log("         💡 RISC Zero cryptographic verification failed");
                    console.log("         💡 Seal doesn't match the journal/image ID");
                } else if (error.message.includes("revert")) {
                    console.log("         💡 Contract execution reverted");
                } else {
                    console.log("         💡 Other error type");
                }
            }
        }
        
        // Check final state
        console.log("\n📊 Final State:");
        const finalProfile = await creditSystem.getUserCreditProfile(user.address);
        console.log("   Credit Score:", finalProfile.finalScore.toString());
        console.log("   Has Account:", finalProfile.hasAccount);
        console.log("   Borrowing Eligible:", finalProfile.isEligible);
        
        // Summary
        console.log("\n📋 INTEGRATION TEST SUMMARY:");
        console.log("===========================");
        
        if (successfulFormat) {
            console.log("✅ SUCCESS! Found working journal format:");
            console.log(`   Format: ${successfulFormat.name}`);
            console.log(`   Size: ${successfulFormat.data.length} bytes`);
            console.log("   🎉 Your IntegratedCreditSystem is working!");
            console.log("   🎉 Credit verification completed successfully!");
        } else {
            console.log("❌ All journal formats failed verification");
            console.log("💡 This indicates:");
            console.log("   - Your receipt contains test data, not a real proof");
            console.log("   - The seal doesn't match your account verification program");
            console.log("   - Image ID mismatch between receipt and contract");
            console.log("   - Need to generate real RISC Zero proofs");
        }
        
        console.log("\n🚀 NEXT STEPS:");
        if (successfulFormat) {
            console.log("1. ✅ Test with TradFi and Nesting proofs");
            console.log("2. ✅ Integrate with LiquidityPoolV3");
            console.log("3. ✅ Build user interface");
            console.log("4. ✅ Deploy to production");
        } else {
            console.log("1. 🎯 Generate real RISC Zero proofs for account verification");
            console.log("2. 🔍 Verify image IDs match your guest programs");
            console.log("3. 🧪 Test with real proofs");
            console.log("4. 🔗 Complete integration");
        }
        
    } catch (error) {
        console.error("❌ Integration test failed:", error.message);
        throw error;
    }
}

if (require.main === module) {
    main()
        .then(() => {
            console.log("\n🎯 Integration testing completed!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Integration testing failed:", error);
            process.exit(1);
        });
}

module.exports = { main };