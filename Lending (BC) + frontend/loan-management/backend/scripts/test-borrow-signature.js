const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("🔍 Testing borrow function signature...");
    
    try {
        // Load deployed contract addresses
        const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/addresses.json')));
        
        // Get the LiquidityPool contract
        const LiquidityPool = await ethers.getContractAt('LiquidityPool', addresses.LiquidityPool);
        
        // Check the contract interface
        console.log("\n📋 Available borrow functions:");
        const borrowFunctions = LiquidityPool.interface.fragments.filter(f => 
            f.type === 'function' && f.name === 'borrow'
        );
        
        borrowFunctions.forEach((func, index) => {
            console.log(`${index + 1}. ${func.format()}`);
        });
        
        if (borrowFunctions.length === 0) {
            console.log("❌ No borrow functions found in contract interface!");
            
            // Show all functions for debugging
            console.log("\n📋 All available functions:");
            const allFunctions = LiquidityPool.interface.fragments.filter(f => f.type === 'function');
            allFunctions.slice(0, 10).forEach((func, index) => {
                console.log(`${index + 1}. ${func.format()}`);
            });
            if (allFunctions.length > 10) {
                console.log(`... and ${allFunctions.length - 10} more functions`);
            }
        }
        
        // Test the function signature
        if (borrowFunctions.length > 0) {
            const borrowFunc = borrowFunctions[0];
            console.log(`\n✅ Found borrow function: ${borrowFunc.format()}`);
            console.log(`   Parameters: ${borrowFunc.inputs.map(i => `${i.type} ${i.name}`).join(', ')}`);
            
            // Test if we can encode the function call
            try {
                const testAmount = ethers.parseEther('0.5');
                const testNullifier = ethers.keccak256(ethers.toUtf8Bytes('test'));
                
                if (borrowFunc.inputs.length === 2) {
                    const encoded = LiquidityPool.interface.encodeFunctionData('borrow', [testAmount, testNullifier]);
                    console.log(`✅ Successfully encoded borrow call with 2 parameters`);
                } else if (borrowFunc.inputs.length === 1) {
                    const encoded = LiquidityPool.interface.encodeFunctionData('borrow', [testAmount]);
                    console.log(`✅ Successfully encoded borrow call with 1 parameter`);
                } else {
                    console.log(`❌ Unexpected number of parameters: ${borrowFunc.inputs.length}`);
                }
            } catch (encodeError) {
                console.log(`❌ Failed to encode function call: ${encodeError.message}`);
            }
        }
        
        // Check contract deployment
        const code = await ethers.provider.getCode(addresses.LiquidityPool);
        if (code === '0x') {
            console.log(`❌ No contract deployed at ${addresses.LiquidityPool}`);
        } else {
            console.log(`✅ Contract deployed at ${addresses.LiquidityPool}`);
        }
        
    } catch (error) {
        console.error("❌ Error testing borrow signature:", error.message);
        
        if (error.message.includes('no matching fragment')) {
            console.log("\n💡 This suggests the contract ABI doesn't match the deployed contract.");
            console.log("   Try recompiling and redeploying:");
            console.log("   1. npx hardhat clean");
            console.log("   2. npx hardhat compile");
            console.log("   3. npx hardhat run scripts/deployAll2.js --network localhost");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
