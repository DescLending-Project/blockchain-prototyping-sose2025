const { ethers } = require("hardhat");
const fs = require('fs');

// Your deployed contract addresses
const GROTH16_VERIFIER_ADDRESS = "0x0f0b283F3639CC87EFeA97c075b4881DbdacCEAD";
const SIMPLE_RISC0_TEST_ADDRESS = "0xbFeCf04c85b91279bC4B5E1C991944CfE076C955";

// Your extracted image IDs
const IMAGE_IDS = {
    account: "0xb083f461f1de589187ceac04a9eb2c0fd7c99b8c80f4ed3f3d45963c8b9606bf",
    tradfi: "0x81c6f5d0702b3a373ce771febb63581ed62fbd6ff427e4182bb827144e4a4c4c",
    nesting: "0xc5f84dae4b65b7ddd4591d0a119bcfb84fec97156216be7014ff03e1ff8f380e"
};

/**
 * Convert RISC Zero integer array to proper bytes
 */
function integersToBytes(intArray) {
    const bytes = new Uint8Array(intArray.length * 4);
    const view = new DataView(bytes.buffer);

    for (let i = 0; i < intArray.length; i++) {
        view.setUint32(i * 4, intArray[i], true); // little-endian
    }

    return bytes;
}

/**
 * Parse the journal data properly
 */
function parseJournalData(journalObj) {
    try {
        console.log(`📄 Parsing journal data...`);
        console.log(`📋 Journal keys: ${Object.keys(journalObj).join(', ')}`);

        // The journal often contains the actual output data from the guest program
        // For account proofs, this might contain balance, nonce, etc.

        if (typeof journalObj === 'object') {
            // If it's an object, serialize it
            const journalStr = JSON.stringify(journalObj);
            console.log(`📝 Journal content preview: ${journalStr.substring(0, 200)}...`);
            return ethers.toUtf8Bytes(journalStr);
        } else if (typeof journalObj === 'string') {
            // If it's a string, convert directly
            return ethers.toUtf8Bytes(journalObj);
        } else {
            // Fallback
            return ethers.toUtf8Bytes(JSON.stringify(journalObj));
        }
    } catch (error) {
        console.error(`❌ Journal parsing failed:`, error.message);
        return ethers.toUtf8Bytes("{}"); // Empty JSON as fallback
    }
}

/**
 * Test with the real Groth16 verifier directly
 */
async function testDirectVerification(seal, imageId, journalHash) {
    try {
        console.log(`\n🔐 Testing direct Groth16 verification...`);
        console.log(`   Image ID: ${imageId}`);
        console.log(`   Journal hash: ${journalHash}`);
        console.log(`   Seal size: ${seal.length} bytes`);

        const [signer] = await ethers.getSigners();
        const verifier = await ethers.getContractAt("RiscZeroGroth16Verifier", GROTH16_VERIFIER_ADDRESS, signer);

        // Call the verifier directly
        await verifier.verify(seal, imageId, journalHash, {
            gasLimit: 10000000 // High gas limit for verification
        });

        console.log(`✅ Direct Groth16 verification successful!`);
        return true;

    } catch (error) {
        console.error(`❌ Direct verification failed:`, error.message);

        if (error.message.includes("VerificationFailed")) {
            console.log(`💡 Cryptographic verification failed. This could mean:`);
            console.log(`   - Seal doesn't match the image ID`);
            console.log(`   - Journal hash is incorrect`);
            console.log(`   - Control parameters mismatch`);
            console.log(`   - This is a test/incomplete proof`);
        }

        return false;
    }
}

/**
 * Try different journal hash calculations
 */
function calculatePossibleJournalHashes(journalData, journalObj) {
    const hashes = [];

    try {
        // Method 1: Hash the raw journal data
        const hash1 = ethers.keccak256(journalData);
        hashes.push({ method: "raw-journal-data", hash: hash1 });

        // Method 2: Hash the stringified journal object
        const journalStr = JSON.stringify(journalObj);
        const hash2 = ethers.keccak256(ethers.toUtf8Bytes(journalStr));
        hashes.push({ method: "stringified-journal", hash: hash2 });

        // Method 3: SHA256 instead of keccak256 (RISC Zero uses SHA256)
        const hash3 = ethers.sha256(journalData);
        hashes.push({ method: "sha256-journal-data", hash: hash3 });

        // Method 4: Empty journal (some proofs have no public outputs)
        const hash4 = ethers.sha256(ethers.toUtf8Bytes(""));
        hashes.push({ method: "empty-journal", hash: hash4 });

        // Method 5: Hash the journal as it appears in the JSON
        if (journalObj && typeof journalObj === 'object') {
            const jsonBytes = ethers.toUtf8Bytes(JSON.stringify(journalObj));
            const hash5 = ethers.sha256(jsonBytes);
            hashes.push({ method: "json-object-sha256", hash: hash5 });
        }

        console.log(`🔢 Generated ${hashes.length} possible journal hashes:`);
        hashes.forEach((h, i) => {
            console.log(`   ${i + 1}. ${h.method}: ${h.hash}`);
        });

        return hashes;

    } catch (error) {
        console.error(`❌ Hash calculation failed:`, error.message);
        return [];
    }
}

/**
 * Main verification function
 */
async function main() {
    console.log("🚀 RISC Zero Full Verification Test");
    console.log("===================================");

    // Load and parse the JSON receipt
    const filePath = "receipts/account/receipt.json";
    if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${filePath}`);
        return;
    }

    console.log(`📁 Loading receipt: ${filePath}`);
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Extract the seal properly
    const sealInts = jsonData.inner.Succinct.seal;
    const sealBytes = integersToBytes(sealInts);
    const seal = '0x' + Buffer.from(sealBytes).toString('hex');

    console.log(`✅ Converted seal: ${sealBytes.length} bytes`);

    // Parse journal
    const journalData = parseJournalData(jsonData.journal);

    // Calculate possible journal hashes
    const journalHashes = calculatePossibleJournalHashes(journalData, jsonData.journal);

    if (journalHashes.length === 0) {
        console.log(`❌ Could not generate journal hashes`);
        return;
    }

    // Try verification with account image ID and different journal hashes
    console.log(`\n🧪 Testing verification with account image ID...`);

    let verificationSuccess = false;
    for (const { method, hash } of journalHashes) {
        console.log(`\n🔍 Trying ${method}...`);

        const success = await testDirectVerification(
            sealBytes, // Use raw bytes, not hex string
            IMAGE_IDS.account,
            hash
        );

        if (success) {
            console.log(`🎉 SUCCESS with ${method}!`);
            verificationSuccess = true;
            break;
        }
    }

    if (!verificationSuccess) {
        console.log(`\n🔧 Direct verification failed with all methods.`);
        console.log(`💡 This might be because:`);
        console.log(`   1. This is a test receipt, not a real proof`);
        console.log(`   2. The image ID doesn't match the actual guest program`);
        console.log(`   3. The seal format needs different handling`);
        console.log(`   4. Control parameters in the verifier don't match`);

        // Try with a minimal test to see if the verifier works at all
        console.log(`\n🧪 Testing if verifier contract is functional...`);

        try {
            const [signer] = await ethers.getSigners();
            const verifier = await ethers.getContractAt("RiscZeroGroth16Verifier", GROTH16_VERIFIER_ADDRESS, signer);

            // Try to read the selector to see if contract is working
            const selector = await verifier.SELECTOR();
            console.log(`✅ Verifier contract is responsive, selector: ${selector}`);

            // Check if our control parameters match
            const controlRoot = await verifier.CONTROL_ROOT_0();
            console.log(`📋 Control root (part): ${controlRoot}`);

        } catch (contractError) {
            console.error(`❌ Verifier contract issue:`, contractError.message);
        }
    }

    // Summary
    console.log(`\n📋 VERIFICATION SUMMARY`);
    console.log(`======================`);
    console.log(`Receipt parsed: ✅`);
    console.log(`Seal extracted: ✅ (${sealBytes.length} bytes)`);
    console.log(`Journal parsed: ✅ (${journalData.length} bytes)`);
    console.log(`Direct verification: ${verificationSuccess ? '✅' : '❌'}`);

    if (verificationSuccess) {
        console.log(`\n🎉 READY FOR INTEGRATION!`);
        console.log(`Your RISC Zero verification system is working correctly.`);
        console.log(`Next steps:`);
        console.log(`1. Test with TradFi and Nesting receipts`);
        console.log(`2. Integrate with LiquidityPool credit scoring`);
        console.log(`3. Build user interface for proof submission`);
    } else {
        console.log(`\n🔧 TROUBLESHOOTING NEEDED`);
        console.log(`The receipt format is correct, but verification fails.`);
        console.log(`Contact your RISC Zero team to verify:`);
        console.log(`- Are these production receipts or test data?`);
        console.log(`- Do the image IDs match the actual guest programs?`);
        console.log(`- Are the control parameters correct?`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}