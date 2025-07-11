// Debug script to identify exactly where the account mismatch is occurring
const { ethers } = require("hardhat");

async function debugAccountMismatch() {
    console.log("🔍 Debugging account mismatch issue...");
    
    const addresses = {
        demoTester: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82"
    };
    
    const demoTester = await ethers.getContractAt("DemoTester", addresses.demoTester);
    const [deployer, user] = await ethers.getSigners();
    
    console.log("User address:", user.address);
    
    // Generate account proof and decode it to see what address is actually in there
    console.log("\n🔍 Step 1: Generate and decode account proof");
    const [accountSeal, accountJournal] = await demoTester.connect(user).generateAccountProof();
    
    console.log("Account seal length:", accountSeal.length);
    console.log("Account seal (first 100 chars):", accountSeal.slice(0, 100));
    
    console.log("\n🔍 Step 2: Decode journal data");
    try {
        // The journal should be ABI-encoded MockAccountProof struct
        const accountProofTypes = [
            "address", // account
            "uint256", // nonce  
            "uint256", // balance
            "bytes32", // storageRoot
            "bytes32", // codeHash
            "uint256", // blockNumber
            "bytes32"  // stateRoot
        ];
        
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(accountProofTypes, accountJournal);
        console.log("Decoded account proof:");
        console.log("- Account address:", decoded[0]);
        console.log("- Nonce:", decoded[1].toString());
        console.log("- Balance:", decoded[2].toString());
        console.log("- Block number:", decoded[5].toString());
        
        if (decoded[0].toLowerCase() !== user.address.toLowerCase()) {
            console.log("❌ FOUND THE ISSUE: Account mismatch!");
            console.log("Expected:", user.address);
            console.log("Got:", decoded[0]);
        } else {
            console.log("✅ Account addresses match");
        }
        
    } catch (error) {
        console.log("❌ Error decoding journal:", error.message);
    }
    
    // test nesting proof too
    console.log("\n🔍 Step 3: Check nesting proof");
    const [nestingSeal, nestingJournal] = await demoTester.connect(user).generateNestingProof(750);
    
    try {
        const nestingProofTypes = [
            "address", // account
            "uint256", // defiScore
            "uint256", // tradfiScore
            "uint256", // hybridScore
            "uint256"  // timestamp
        ];
        
        const decodedNesting = ethers.AbiCoder.defaultAbiCoder().decode(nestingProofTypes, nestingJournal);
        console.log("Decoded nesting proof:");
        console.log("- Account address:", decodedNesting[0]);
        console.log("- DeFi score:", decodedNesting[1].toString());
        console.log("- TradFi score:", decodedNesting[2].toString());
        console.log("- Hybrid score:", decodedNesting[3].toString());
        
        if (decodedNesting[0].toLowerCase() !== user.address.toLowerCase()) {
            console.log("❌ FOUND THE ISSUE: Nesting account mismatch!");
            console.log("Expected:", user.address);
            console.log("Got:", decodedNesting[0]);
        } else {
            console.log("✅ Nesting account addresses match");
        }
        
    } catch (error) {
        console.log("❌ Error decoding nesting journal:", error.message);
    }
}

async function main() {
    await debugAccountMismatch();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { debugAccountMismatch };