// deploy-matching-verifier.js
const { ethers } = require("hardhat");

async function deployMatchingVerifier() {
    console.log("🔧 Deploying verifier with matching control ID...");
    
    // Use the control ID from the error message
    const CORRECT_CONTROL_ROOT = "0x6da21d5bc6a7534bc686b9294717f12994b13c67183c86668c62d01fcc453151";
    const BN254_CONTROL_ID = "0x04446e66d300eb7fb45c9726bb53c793dda407a62e9601618bb43c5c14657ac0"; // From your ControlID.sol
    
    const RiscZeroGroth16Verifier = await ethers.getContractFactory("RiscZeroGroth16Verifier");
    const verifier = await RiscZeroGroth16Verifier.deploy(CORRECT_CONTROL_ROOT, BN254_CONTROL_ID);
    await verifier.waitForDeployment();
    
    console.log("✅ Matching verifier deployed to:", await verifier.getAddress());
    
    // Update SimpleRISC0Test to use this verifier
    const SimpleRISC0TestFactory = await ethers.getContractFactory("SimpleRISC0Test");
    const risc0Test = await SimpleRISC0TestFactory.deploy(await verifier.getAddress());
    await risc0Test.waitForDeployment();
    
    console.log("✅ Updated SimpleRISC0Test deployed to:", await risc0Test.getAddress());
}

deployMatchingVerifier().catch(console.error);