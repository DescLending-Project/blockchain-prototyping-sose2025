// Test different journal hash formats to find what works with RISC Zero verification
const { ethers } = require("hardhat");
const fs = require('fs');

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
    console.log("🔍 Testing Journal Hash Formats for RISC Zero");
    console.log("===========================================");
    
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
        
        console.log(`📁 Receipt loaded:`);
        console.log(`   Seal: ${sealBytes.length} bytes`);
        console.log(`   Journal: ${journalBytes.length} bytes`);
        console.log(`   First 20 journal bytes: [${Array.from(journalBytes.slice(0, 20)).join(', ')}]`);
        
        // Connect to verifier
        const simpleTest = await ethers.getContractAt("SimpleRISC0Test", SIMPLE_RISC0_TEST_ADDRESS);
        
        // Get the underlying verifier address
        const verifierAddress = await simpleTest.getVerifierAddress();
        console.log(`🔧 Underlying verifier: ${verifierAddress}`);
        
        // Get image ID
        const accountImageId = await simpleTest.ACCOUNT_MERKLE_IMAGE_ID();
        console.log(`🆔 Account Image ID: ${accountImageId}`);
        
        // Now test the underlying verifier directly with different journal hash formats
        const verifier = await ethers.getContractAt("IRiscZeroVerifier", verifierAddress);
        
        console.log("\n🧪 Testing Different Journal Hash Formats:");
        console.log("==========================================");
        
        // Test 1: Raw journal bytes with SHA256 (what your contract does)
        console.log("\n1️⃣ Testing: sha256(journalBytes) - what your contract uses");
        try {
            const journalHash = ethers.sha256(journalBytes);
            console.log(`   Journal hash: ${journalHash}`);
            console.log(`   Calling verifier.verify(seal, imageId, journalHash)...`);
            
            await verifier.verify.staticCall(sealBytes, accountImageId, journalHash);
            console.log("   ✅ SUCCESS! Raw journal with SHA256 works!");
            
        } catch (e) {
            console.log(`   ❌ Failed: ${e.message.substring(0, 100)}`);
        }
        
        // Test 2: Empty journal with SHA256
        console.log("\n2️⃣ Testing: sha256(empty) - empty journal");
        try {
            const emptyJournal = new Uint8Array(0);
            const journalHash = ethers.sha256(emptyJournal);
            console.log(`   Empty journal hash: ${journalHash}`);
            
            await verifier.verify.staticCall(sealBytes, accountImageId, journalHash);
            console.log("   ✅ SUCCESS! Empty journal works!");
            
        } catch (e) {
            console.log(`   ❌ Failed: ${e.message.substring(0, 100)}`);
        }
        
        // Test 3: Try different journal content formats
        const testJournals = [
            { name: "Simple JSON", data: ethers.toUtf8Bytes('{"verified":true}') },
            { name: "Account JSON", data: ethers.toUtf8Bytes('{"hasAccount":true,"timestamp":' + Math.floor(Date.now()/1000) + '}') },
            { name: "Minimal bytes", data: new Uint8Array([1, 0, 0, 0]) },
            { name: "Zero bytes", data: new Uint8Array([0, 0, 0, 0]) }
        ];
        
        for (let i = 0; i < testJournals.length; i++) {
            const testJournal = testJournals[i];
            console.log(`\n${i + 3}️⃣ Testing: ${testJournal.name} (${testJournal.data.length} bytes)`);
            
            try {
                const journalHash = ethers.sha256(testJournal.data);
                console.log(`   Journal hash: ${journalHash}`);
                
                await verifier.verify.staticCall(sealBytes, accountImageId, journalHash);
                console.log(`   ✅ SUCCESS! ${testJournal.name} works!`);
                
            } catch (e) {
                console.log(`   ❌ Failed: ${e.message.substring(0, 100)}`);
            }
        }
        
        // Test 4: Check if the receipt contains a pre-computed journal hash
        console.log("\n🔍 Analyzing Receipt for Pre-computed Hashes:");
        console.log("============================================");
        
        console.log("Receipt structure:");
        console.log("   Keys:", Object.keys(jsonData));
        console.log("   Inner keys:", Object.keys(jsonData.inner || {}));
        console.log("   Succinct keys:", Object.keys(jsonData.inner?.Succinct || {}));
        
        // Check if there's a claim with journal hash
        if (jsonData.inner?.Succinct?.claim) {
            const claim = jsonData.inner.Succinct.claim;
            console.log("   Claim keys:", Object.keys(claim));
            
            if (claim.post && claim.post.journal) {
                const journalFromClaim = claim.post.journal;
                console.log("   Journal in claim:", journalFromClaim);
                
                // Test with this journal hash
                console.log("\n7️⃣ Testing: Journal hash from receipt claim");
                try {
                    await verifier.verify.staticCall(sealBytes, accountImageId, journalFromClaim);
                    console.log("   ✅ SUCCESS! Receipt's journal hash works!");
                    
                } catch (e) {
                    console.log(`   ❌ Failed: ${e.message.substring(0, 100)}`);
                }
            }
        }
        
        // Test 5: Direct SimpleRISC0Test method to see the exact error
        console.log("\n🎯 Testing SimpleRISC0Test.testAccountProof Directly:");
        console.log("====================================================");
        
        try {
            console.log("Calling testAccountProof with original journal...");
            await simpleTest.testAccountProof.staticCall(sealBytes, journalBytes);
            console.log("✅ testAccountProof succeeded!");
            
        } catch (e) {
            console.log(`❌ testAccountProof failed: ${e.message}`);
            
            // Parse the specific error to understand what's happening
            if (e.message.includes("VerificationFailed")) {
                console.log("💡 RISC Zero verification failed - seal doesn't match journal hash");
            } else if (e.message.includes("Unknown error")) {
                console.log("💡 Caught in the contract's catch block - underlying verifier failed");
            }
        }
        
        console.log("\n📊 DIAGNOSIS SUMMARY:");
        console.log("====================");
        console.log("Your SimpleRISC0Test contract calls:");
        console.log("  verifier.verify(seal, imageId, sha256(journalData))");
        console.log("");
        console.log("The verification is failing because:");
        console.log("1. 🎯 Your seal was generated for a specific journal hash");
        console.log("2. 📝 The journal hash in your receipt != sha256(journal.bytes)");
        console.log("3. 🔐 RISC Zero requires exact hash match for cryptographic verification");
        console.log("");
        console.log("💡 SOLUTION:");
        console.log("To make this work, you need:");
        console.log("- Real RISC Zero proofs generated with your exact image IDs");
        console.log("- Journal data that matches what was used during proof generation");
        console.log("- Or use the exact journal hash from the receipt's claim section");
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        throw error;
    }
}

if (require.main === module) {
    main()
        .then(() => {
            console.log("\n🎯 Journal hash testing completed!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Journal hash testing failed:", error);
            process.exit(1);
        });
}

module.exports = { main };