const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function checkDeployment() {
    console.log("🔍 Checking current deployment status...\n");
    
    try {
        // Get current network info
        const [deployer] = await ethers.getSigners();
        const provider = deployer.provider;
        const network = await provider.getNetwork();
        const latestBlock = await provider.getBlockNumber();
        
        console.log(`📡 Network: ${network.name} (Chain ID: ${network.chainId})`);
        console.log(`📦 Latest block: ${latestBlock}`);
        console.log(`👤 Deployer: ${deployer.address}\n`);
        
        // Load frontend addresses
        const frontendAddressesPath = path.join(__dirname, '../../frontend/src/addresses.json');
        const contractAddressesPath = path.join(__dirname, '../../frontend/src/contractAddresses.js');
        
        let frontendAddresses = {};
        let contractAddresses = {};
        
        // Check if frontend addresses exist
        if (fs.existsSync(frontendAddressesPath)) {
            frontendAddresses = JSON.parse(fs.readFileSync(frontendAddressesPath, 'utf8'));
            console.log("✅ Found frontend/src/addresses.json");
        } else {
            console.log("❌ Missing frontend/src/addresses.json");
        }
        
        if (fs.existsSync(contractAddressesPath)) {
            const contractAddressesContent = fs.readFileSync(contractAddressesPath, 'utf8');
            // Extract localhost addresses from the file
            const localhostMatch = contractAddressesContent.match(/localhost:\s*({[^}]+})/s);
            if (localhostMatch) {
                contractAddresses = JSON.parse(localhostMatch[1].replace(/"/g, '"'));
                console.log("✅ Found frontend/src/contractAddresses.js");
            }
        } else {
            console.log("❌ Missing frontend/src/contractAddresses.js");
        }
        
        // Check key contracts
        const contractsToCheck = [
            'LiquidityPool',
            'LendingManager', 
            'StablecoinManager',
            'VotingToken',
            'ProtocolGovernor'
        ];
        
        console.log("\n🏗️  Contract Deployment Status:");
        console.log("=" .repeat(50));
        
        let allDeployed = true;
        
        for (const contractName of contractsToCheck) {
            const address = frontendAddresses[contractName] || contractAddresses[contractName];
            
            if (!address) {
                console.log(`❌ ${contractName}: No address found`);
                allDeployed = false;
                continue;
            }
            
            try {
                const code = await provider.getCode(address);
                if (code === '0x') {
                    console.log(`❌ ${contractName}: ${address} (No contract deployed)`);
                    allDeployed = false;
                } else {
                    console.log(`✅ ${contractName}: ${address} (Deployed)`);
                }
            } catch (error) {
                console.log(`❌ ${contractName}: ${address} (Error: ${error.message})`);
                allDeployed = false;
            }
        }
        
        console.log("\n" + "=".repeat(50));
        
        if (allDeployed) {
            console.log("🎉 All contracts are properly deployed!");
            console.log("✅ Frontend should be able to connect successfully.");
        } else {
            console.log("⚠️  Some contracts are missing or not deployed.");
            console.log("🔧 Run the deployment script:");
            console.log("   npx hardhat run scripts/deployAll2.js --network localhost");
        }
        
        // Check if addresses are in sync
        const addressesMatch = JSON.stringify(frontendAddresses) === JSON.stringify(contractAddresses);
        if (!addressesMatch && Object.keys(frontendAddresses).length > 0 && Object.keys(contractAddresses).length > 0) {
            console.log("\n⚠️  Address files are not in sync!");
            console.log("   This might cause frontend issues.");
        } else if (Object.keys(frontendAddresses).length > 0) {
            console.log("\n✅ Address files are in sync.");
        }
        
        console.log("\n📋 Quick Commands:");
        console.log("   Deploy contracts: npx hardhat run scripts/deployAll2.js --network localhost");
        console.log("   Start frontend:   cd ../frontend && npm run dev");
        console.log("   Check again:      node scripts/check-deployment.js");
        
    } catch (error) {
        console.error("❌ Error checking deployment:", error.message);
        
        if (error.message.includes('could not detect network')) {
            console.log("\n💡 Make sure Hardhat node is running:");
            console.log("   npx hardhat node");
        }
    }
}

// Run the check
checkDeployment()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
