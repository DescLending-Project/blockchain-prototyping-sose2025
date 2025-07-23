const { ethers } = require("hardhat");

async function deployRealVerifier() {
    console.log("Deploying Real RiscZeroGroth16Verifier...");

    const [deployer] = await ethers.getSigners();

    // Get control IDs from ControlID contract , THERE IS A PROBLEM WITH THE CONTROL ID, IT ALWAYS GIVES MISMATCH, THIS IS PROBABLY DUE TO VERSIONING OR SOMETHING
    const ControlID = await ethers.getContractFactory("ControlID");
    const controlLib = await ControlID.deploy();
    await controlLib.deployed();

    const CONTROL_ROOT = await controlLib.CONTROL_ROOT();
    const BN254_CONTROL_ID = await controlLib.BN254_CONTROL_ID();

    console.log("Control Root:", CONTROL_ROOT);
    console.log("BN254 Control ID:", BN254_CONTROL_ID);

    // deploy real verifier
    const RiscZeroGroth16Verifier = await ethers.getContractFactory("RiscZeroGroth16Verifier");
    const realVerifier = await RiscZeroGroth16Verifier.deploy(CONTROL_ROOT, BN254_CONTROL_ID);
    await realVerifier.deployed();

    const verifierAddress = await realVerifier.getAddress();
    console.log("✅ Real RiscZeroGroth16Verifier deployed to:", verifierAddress);

    return verifierAddress;
}

deployRealVerifier().catch(console.error);