const { ethers } = require("hardhat");

async function testNestingVerification() {
    const addresses = {
        risc0Test: "0x4C2F7092C2aE51D986bEFEe378e50BD4dB99C901", // existing address
        demoTester: "0x18E317A7D70d8fBf8e6E893616b52390EbBdb629"
    };
    
    const risc0Test = await ethers.getContractAt("SimpleRISC0Test", addresses.risc0Test);
    const demoTester = await ethers.getContractAt("DemoTester", addresses.demoTester);
    
    const [deployer, user] = await ethers.getSigners();
    
    console.log("🧪 Testing nesting proof verification...");
    
    // Generate mock nesting proof
    const [nestingSeal, nestingJournal] = await demoTester.connect(user).generateNestingProof(750);
    
    console.log("Generated nesting proof:");
    console.log("- Seal length:", nestingSeal.length);
    console.log("- Seal preview:", nestingSeal.slice(0, 100));
    
    // with demo mode ON
    console.log("\n1. Testing with demo mode ON:");
    await risc0Test.setDemoMode(true);
    try {
        await risc0Test.connect(user).testNestingProof(nestingSeal, nestingJournal);
        console.log("✅ Mock verification successful");
    } catch (error) {
        console.log("❌ Mock verification failed:", error.message);
    }
    
    //demo mode OFF, trying real verification
    console.log("\n2. Testing with demo mode OFF:");
    await risc0Test.setDemoMode(false);
    try {
        await risc0Test.connect(user).testNestingProof(nestingSeal, nestingJournal);
        console.log("✅ Real verification successful!");
    } catch (error) {
        console.log("❌ Real verification failed:", error.message);
        console.log("This is expected with mock proofs and real verifier");
    }
    
    // Reset demo mode
    await risc0Test.setDemoMode(true);
}

testNestingVerification().catch(console.error);