const { ethers } = require("hardhat");

async function main() {
    console.log("🔍 Checking Ethers Version and Compatibility...\n");
    
    // Get ethers version
    const ethersVersion = ethers.version;
    console.log("📦 Ethers Version:", ethersVersion);
    
    // Check if it's v6
    const isV6 = ethersVersion.startsWith("6");
    console.log("🔢 Is Ethers v6:", isV6);
    
    if (isV6) {
        console.log("✅ Using Ethers v6 - Scripts are compatible!");
        console.log("\n📝 Key differences in v6:");
        console.log("   • getBalance() → ethers.provider.getBalance(address)");
        console.log("   • ethers.ZeroAddress → \"0x0000000000000000000000000000000000000000\"");
        console.log("   • Contract deployment uses .deploy() and .waitForDeployment()");
        console.log("   • Contract addresses use .getAddress()");
    } else {
        console.log("⚠️  Using Ethers v5 - Some scripts may need updates");
        console.log("\n📝 To upgrade to v6:");
        console.log("   npm install ethers@^6.0.0");
    }
    
    // Test basic functionality
    console.log("\n🧪 Testing Basic Functionality:");
    
    try {
        const [signer] = await ethers.getSigners();
        console.log("   ✅ getSigners() works");
        
        const balance = await ethers.provider.getBalance(signer.address);
        console.log("   ✅ getBalance() works:", ethers.formatEther(balance), "ETH");
        
        console.log("   ✅ All basic functions working correctly");
    } catch (error) {
        console.log("   ❌ Error testing functionality:", error.message);
    }
    
    console.log("\n🚀 Ready to deploy ZK-integrated system!");
    console.log("   Run: npx hardhat run scripts/deployZKIntegratedSystem.js --network localhost");
    
    return {
        version: ethersVersion,
        isV6: isV6,
        compatible: isV6
    };
}

main()
    .then((result) => {
        console.log("\n✅ Version check completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Version check failed:", error);
        process.exit(1);
    }); 