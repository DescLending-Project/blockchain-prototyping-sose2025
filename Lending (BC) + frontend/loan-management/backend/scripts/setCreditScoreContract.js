const { ethers } = require("hardhat");

async function main() {
    console.log('==============================');
    console.log('🔗 Setting Credit Score Contract');
    console.log('==============================');

    // Get the deployer/signer
    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);

    // Contract addresses - UPDATE THESE WITH YOUR ACTUAL ADDRESSES
    const LIQUIDITY_POOL_ADDRESS = "0xB92c47BF4fE7503348e5d8089881F823fcA12Cf3";
    const CREDIT_SCORE_CONTRACT_ADDRESS = "0xE3F3a75ef923023FFeb9a502c3Bc7dF30c334B6a ";

    // Validate addresses
    if (LIQUIDITY_POOL_ADDRESS === "YOUR_LIQUIDITY_POOL_ADDRESS_HERE" || 
        CREDIT_SCORE_CONTRACT_ADDRESS === "YOUR_RISC0_CREDIT_SCORE_CONTRACT_ADDRESS_HERE") {
        console.error("❌ Please update the contract addresses in the script!");
        process.exit(1);
    }

    // Get LiquidityPool contract instance
    console.log("🔄 Getting LiquidityPool contract instance...");
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = LiquidityPool.attach(LIQUIDITY_POOL_ADDRESS);
    
    // Check current timelock/admin
    try {
        const currentAdmin = await liquidityPool.timelock();
        console.log("Current LiquidityPool admin:", currentAdmin);
        
        if (currentAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log("⚠️  Warning: Deployer is not the admin. Admin is:", currentAdmin);
            console.log("ℹ️  You may need to use governance proposal or different signer");
        }
    } catch (error) {
        console.log("Could not check admin address:", error.message);
    }

    // Check if RISC0 is currently enabled
    try {
        const currentRISC0Status = await liquidityPool.useRISC0CreditScores();
        console.log("Current RISC0 status:", currentRISC0Status);
        
        const currentCreditScoreContract = await liquidityPool.creditScoreContract();
        console.log("Current credit score contract:", currentCreditScoreContract);
    } catch (error) {
        console.log("Could not check current RISC0 status:", error.message);
    }

    // Set the credit score contract
    console.log("🔄 Setting credit score contract address...");
    console.log("Credit Score Contract Address:", CREDIT_SCORE_CONTRACT_ADDRESS);
    
    try {
        const tx = await liquidityPool.setCreditScoreContract(
            CREDIT_SCORE_CONTRACT_ADDRESS,
            { gasLimit: 200000 }
        );
        
        console.log("Transaction hash:", tx.hash);
        console.log("⏳ Waiting for confirmation...");
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
        
        // Verify the setting worked
        console.log("🔍 Verifying the update...");
        const newCreditScoreContract = await liquidityPool.creditScoreContract();
        const newRISC0Status = await liquidityPool.useRISC0CreditScores();
        
        console.log("New credit score contract:", newCreditScoreContract);
        console.log("New RISC0 status:", newRISC0Status);
        
        if (newCreditScoreContract.toLowerCase() === CREDIT_SCORE_CONTRACT_ADDRESS.toLowerCase()) {
            console.log("✅ Credit score contract successfully set!");
            if (newRISC0Status) {
                console.log("✅ RISC0 credit scores automatically enabled!");
            }
        } else {
            console.log("❌ Credit score contract setting failed!");
        }
        
    } catch (error) {
        console.error("❌ Failed to set credit score contract:");
        console.error("Error:", error.message);
        
        if (error.message.includes("OnlyTimelockLiquidityPool")) {
            console.log("💡 This function requires timelock/admin privileges");
            console.log("💡 Consider using governance proposal or different admin account");
        }
    }
}

// Alternative function for governance proposal
async function createGovernanceProposal() {
    console.log('==============================');
    console.log('🏛️  Creating Governance Proposal');
    console.log('==============================');

    const [deployer] = await ethers.getSigners();
    
    // Contract addresses - UPDATE THESE
    const GOVERNOR_ADDRESS = "YOUR_GOVERNOR_ADDRESS_HERE";
    const LIQUIDITY_POOL_ADDRESS = "YOUR_LIQUIDITY_POOL_ADDRESS_HERE";
    const CREDIT_SCORE_CONTRACT_ADDRESS = "YOUR_RISC0_CREDIT_SCORE_CONTRACT_ADDRESS_HERE";

    if (GOVERNOR_ADDRESS === "YOUR_GOVERNOR_ADDRESS_HERE" || 
        LIQUIDITY_POOL_ADDRESS === "YOUR_LIQUIDITY_POOL_ADDRESS_HERE" || 
        CREDIT_SCORE_CONTRACT_ADDRESS === "YOUR_RISC0_CREDIT_SCORE_CONTRACT_ADDRESS_HERE") {
        console.error("❌ Please update the contract addresses in the script!");
        return;
    }

    // Get governor contract
    const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
    const governor = ProtocolGovernor.attach(GOVERNOR_ADDRESS);

    // Prepare proposal data
    const liquidityPoolInterface = new ethers.Interface([
        "function setCreditScoreContract(address _creditScoreContract)"
    ]);
    
    const calldata = liquidityPoolInterface.encodeFunctionData(
        "setCreditScoreContract",
        [CREDIT_SCORE_CONTRACT_ADDRESS]
    );

    const targets = [LIQUIDITY_POOL_ADDRESS];
    const values = [0];
    const calldatas = [calldata];
    const description = `Set RISC0 Credit Score Contract to ${CREDIT_SCORE_CONTRACT_ADDRESS}`;

    console.log("📝 Proposal details:");
    console.log("Target:", targets[0]);
    console.log("Value:", values[0]);
    console.log("Calldata:", calldatas[0]);
    console.log("Description:", description);

    try {
        const tx = await governor.propose(targets, values, calldatas, description);
        console.log("Proposal transaction hash:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("✅ Proposal created in block:", receipt.blockNumber);
        
        // Extract proposal ID from events
        const proposalCreatedEvent = receipt.logs.find(log => {
            try {
                const parsed = governor.interface.parseLog(log);
                return parsed.name === 'ProposalCreated';
            } catch {
                return false;
            }
        });
        
        if (proposalCreatedEvent) {
            const proposalId = proposalCreatedEvent.args.proposalId;
            console.log("📋 Proposal ID:", proposalId.toString());
            console.log("💡 Use this ID to vote on and execute the proposal");
        }
        
    } catch (error) {
        console.error("❌ Failed to create governance proposal:");
        console.error("Error:", error.message);
    }
}

// Main execution with command line argument support
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes("--governance")) {
        createGovernanceProposal()
            .then(() => {
                console.log("✅ Governance proposal creation completed");
                process.exit(0);
            })
            .catch((error) => {
                console.error("❌ Governance proposal creation failed:");
                console.error(error);
                process.exit(1);
            });
    } else {
        main()
            .then(() => {
                console.log("✅ Credit score contract setting completed");
                process.exit(0);
            })
            .catch((error) => {
                console.error("❌ Credit score contract setting failed:");
                console.error(error);
                process.exit(1);
            });
    }
}

module.exports = { main, createGovernanceProposal };