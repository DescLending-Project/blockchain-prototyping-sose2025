// Test direct RISC Zero verification with proper journal format
const { ethers } = require("hardhat");
const fs = require('fs');

// Known verifier address from your deployments
const SIMPLE_RISC0_TEST_ADDRESS = "0xbFeCf04c85b91279bC4B5E1C991944CfE076C955";

function integersToBytes(intArray) {
    const bytes = new Uint8Array(intArray.length * 4);
    const view = new DataView(bytes.buffer);
    
    for (let i = 0; i < intArray.length; i++) {
        view.setUint32(i * 4, intArray[i], true);
    }
    
    return bytes;
}

async function main() {
    console.log("🔍 Direct RISC Zero Verification Test");
    console.log("====================================");
    
    try {
        const [user] = await ethers.getSigners();
        console.log("User:", user.address);
        
        // Load the receipt
        const receiptPath = "receipts/account/receipt.json";
        console.log(`📁 Loading receipt: ${receiptPath}`);
        
        const jsonData = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        
        // Extract seal
        const sealInts = jsonData.inner.Succinct.seal;
        const sealBytes = integersToBytes(sealInts);
        console.log(`✅ Seal: ${sealBytes.length} bytes`);
        
        // Parse journal properly - it contains a bytes array
        console.log("\n📄 Journal Processing:");
        const journalBytesArray = jsonData.journal.bytes;
        const journalBytes = new Uint8Array(journalBytesArray);
        console.log(`   Original journal bytes: ${journalBytesArray.length} elements`);
        console.log(`   As Uint8Array: ${journalBytes.length} bytes`);
        console.log(`   First 20 bytes: [${Array.from(journalBytes.slice(0, 20)).join(', ')}]`);
        
        // Try to decode the journal content
        try {
            // The journal might contain structured data
            console.log("   Attempting to decode journal as string...");
            const journalString = new TextDecoder().decode(journalBytes);
            console.log(`   Decoded string (first 100 chars): "${journalString.substring(0, 100)}"`);
        } catch (e) {
            console.log("   Journal is binary data, not text");
        }
        
        // Connect to the verifier
        console.log("\n🔧 Connecting to SimpleRISC0Test...");
        const verifier = await ethers.getContractAt("SimpleRISC0Test", SIMPLE_RISC0_TEST_ADDRESS);
        
        // Test basic connectivity
        const pingResult = await verifier.ping();
        console.log(`   Ping result: ${pingResult}`);
        
        // Check image IDs
        console.log("\n🆔 Verifying Image IDs:");
        const accountImageId = await verifier.ACCOUNT_MERKLE_IMAGE_ID();
        const tradfiImageId = await verifier.TRADFI_SCORE_IMAGE_ID();
        const nestingImageId = await verifier.NESTING_PROOF_IMAGE_ID();
        
        console.log(`   Account Merkle ID: ${accountImageId}`);
        console.log(`   TradFi Score ID:   ${tradfiImageId}`);
        console.log(`   Nesting Proof ID:  ${nestingImageId}`);
        
        // Test direct verification
        console.log("\n🧪 Testing Direct Verification...");
        
        // Test direct verification
        console.log("\n🧪 Testing Direct Verification Methods...");
        
        // Check which methods are actually available
        console.log("   Available methods in SimpleRISC0Test:");
        try {
            // Test the ping method first
            const pingResult = await verifier.ping();
            console.log(`   ✅ ping(): ${pingResult}`);
        } catch (e) {
            console.log(`   ❌ ping() failed: ${e.message}`);
        }
        
        // Test if the methods your IntegratedCreditSystem calls exist
        const methodsToTest = [
            'testAccountProof',
            'testTradFiProof', 
            'testNestingProof',
            'verifyAccountMerkleProof',
            'verifyTradFiScore',
            'verifyNestingProof'
        ];
        
        for (const methodName of methodsToTest) {
            try {
                console.log(`   Testing ${methodName}...`);
                
                if (methodName.startsWith('test')) {
                    // These are the methods your IntegratedCreditSystem calls
                    await verifier[methodName].staticCall(sealBytes, journalBytes);
                    console.log(`   ✅ ${methodName}: exists and callable`);
                } else {
                    // These are the underlying verification methods
                    const result = await verifier[methodName].staticCall(sealBytes, journalBytes);
                    console.log(`   ✅ ${methodName}: ${result}`);
                }
                
            } catch (e) {
                console.log(`   ❌ ${methodName}: ${e.message.substring(0, 100)}`);
                
                // If it's a verification failure, that's actually good - means method exists
                if (e.message.includes("VerificationFailed") || e.message.includes("revert")) {
                    console.log(`      💡 Method exists but verification failed (expected for test data)`);
                }
            }
        }
        
        // Test with different journal formats to see what the verifier expects
        console.log("\n📝 Testing Journal Format Requirements...");
        
        const testJournals = [
            { name: "Original bytes", data: journalBytes },
            { name: "Empty journal", data: new Uint8Array(0) },
            { name: "Minimal 4-byte", data: new Uint8Array([1, 0, 0, 0]) },
            { name: "Simple JSON", data: new TextEncoder().encode('{"hasAccount":true}') }
        ];
        
        for (const testJournal of testJournals) {
            try {
                console.log(`   Testing with ${testJournal.name} (${testJournal.data.length} bytes)...`);
                
                // Test the main verification method that your contract calls
                await verifier.testAccountProof.staticCall(sealBytes, testJournal.data);
                console.log(`   ✅ testAccountProof accepted ${testJournal.name}`);
                
            } catch (e) {
                const errorMsg = e.message.substring(0, 80);
                console.log(`   ❌ testAccountProof rejected ${testJournal.name}: ${errorMsg}`);
                
                if (e.message.includes("VerificationFailed")) {
                    console.log(`      💡 This means the method works but cryptographic verification failed`);
                } else if (e.message.includes("Unknown error")) {
                    console.log(`      💡 This might be a try/catch in the contract hiding the real error`);
                }
            }
        }
        
        console.log("\n📊 DIRECT VERIFICATION SUMMARY:");
        console.log("==============================");
        console.log("✅ Receipt file loaded successfully");
        console.log("✅ Seal extracted properly");
        console.log("✅ Journal parsed as bytes array");
        console.log("✅ Verifier contract accessible");
        console.log("✅ Image IDs configured");
        
        console.log("\n💡 NEXT STEPS:");
        console.log("1. If verification succeeded: Your receipt is a REAL proof! 🎉");
        console.log("2. If verification failed: You need a real RISC Zero proof for account verification");
        console.log("3. Generate proofs for TradFi and Nesting verification");
        console.log("4. Test the IntegratedCreditSystem with working proofs");
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
}

// No top-level await or promise usage outside functions. main() is only called if run directly.
module.exports = { main };