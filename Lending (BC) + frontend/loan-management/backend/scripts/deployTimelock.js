const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("==============================");
    console.log("🚀 Deploying TimelockController to Sepolia");
    console.log("==============================");

    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log("Network:", network.name);
    console.log("Chain ID:", network.chainId);

    // Get deployer account
    const [deployer] = await ethers.getSigners();
    
    if (!deployer) {
        throw new Error("No deployer account found. Make sure PRIVATE_KEY is set in .env file.");
    }

    console.log("Deploying with account:", deployer.address);
    
    // Check balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
        throw new Error("Deployer account has 0 ETH balance. Please fund it from a Sepolia faucet.");
    }

    console.log("\n🏗️ Deploying TimelockController...");

    // TimelockController constructor parameters
    const minDelay = 3600; // 1 hour delay
    const proposers = [deployer.address]; // Deployer can propose initially
    const executors = [ethers.ZeroAddress]; // Anyone can execute (standard practice)
    const admin = deployer.address; // Deployer is initial admin

    console.log("TimelockController parameters:");
    console.log("- Min delay:", minDelay, "seconds (1 hour)");
    console.log("- Proposers:", proposers);
    console.log("- Executors:", executors, "(anyone can execute)");
    console.log("- Admin:", admin);

    // Deploy TimelockController
    const TimelockController = await ethers.getContractFactory("TimelockController");
    
    console.log("Deploying TimelockController...");
    const timelock = await TimelockController.deploy(
        minDelay,
        proposers,
        executors,
        admin
    );

    console.log("Waiting for deployment confirmation...");
    await timelock.waitForDeployment();
    
    const timelockAddress = await timelock.getAddress();
    console.log("✅ TimelockController deployed to:", timelockAddress);

    // Verify deployment
    console.log("\n🔍 Verifying deployment...");
    
    try {
        const deployedMinDelay = await timelock.getMinDelay();
        console.log("✅ Min delay verified:", deployedMinDelay.toString(), "seconds");
        
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const hasProposerRole = await timelock.hasRole(PROPOSER_ROLE, deployer.address);
        console.log("✅ Deployer has PROPOSER_ROLE:", hasProposerRole);
        
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const hasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress);
        console.log("✅ ZeroAddress has EXECUTOR_ROLE:", hasExecutorRole);
        
    } catch (error) {
        console.log("⚠️ Verification failed:", error.message);
    }

    // Save deployment info
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            TimelockController: {
                address: timelockAddress,
                constructorArgs: {
                    minDelay,
                    proposers,
                    executors,
                    admin
                }
            }
        }
    };

    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    // Save deployment info to file
    const deploymentFile = path.join(deploymentsDir, `timelock-${network.name}-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("📄 Deployment info saved to:", deploymentFile);

    // Display summary
    console.log("\n📋 Deployment Summary:");
    console.log("======================");
    console.log("Network:", network.name);
    console.log("TimelockController:", timelockAddress);
    console.log("Min Delay:", minDelay, "seconds");
    console.log("Deployer:", deployer.address);
    console.log("Gas used: Check transaction on Etherscan");

    console.log("\n🔗 Useful Links:");
    console.log("Etherscan:", `https://sepolia.etherscan.io/address/${timelockAddress}`);
    console.log("Add to MetaMask: Use the address above");

    console.log("\n✅ TimelockController deployment completed successfully!");
    
    // Instructions for next steps
    console.log("\n📝 Next Steps:");
    console.log("1. Verify the contract on Etherscan (optional):");
    console.log(`   npx hardhat verify --network sepolia ${timelockAddress} ${minDelay} '[\"${deployer.address}\"]' '[\"${ethers.ZeroAddress}\"]' \"${admin}\"`);
    console.log("2. Save the contract address for future use");
    console.log("3. Consider transferring admin role to a multisig for production use");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:");
        console.error(error);
        process.exit(1);
    });
