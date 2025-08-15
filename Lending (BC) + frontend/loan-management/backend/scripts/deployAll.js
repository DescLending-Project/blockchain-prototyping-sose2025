console.log('==============================');
console.log('🚀 Starting deployAll.js script');
console.log('==============================');
const { ethers, upgrades, network } = require("hardhat");
const { execSync } = require('child_process');

try {
    console.log('Compiling contracts...');
    execSync('npx hardhat compile', { stdio: 'inherit' });
    console.log('Compilation finished.');
} catch (e) {
    console.error('Compilation failed:', e.message);
    process.exit(1);
}

const iface = new ethers.Interface([
    "function setPriceFeed(address asset, address feed)",
    "function setAllowedContract(address contractAddr, bool allowed)",
    "function setQuorumPercentage(uint256)"
]);

async function debugTiming(governor, proposalId) {
    let proposal;
    try {
        proposal = await governor.proposals(proposalId);
    } catch {
        // fallback for standard Governor proposals that don't have proposals mapping
        proposal = {};
    }
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    console.log(`\nProposal ${proposalId} Timing:`);
    console.log(`- Now: ${now} (${new Date(now * 1000)})`);
    if (proposal.startTime) {
        console.log(`- Start: ${proposal.startTime} (${new Date(proposal.startTime * 1000)})`);
        console.log(`- End: ${proposal.endTime} (${new Date(proposal.endTime * 1000)})`);
        console.log(`- Time remaining: ${proposal.endTime - now} seconds`);
        console.log(`- Executed: ${proposal.executed}`);
    }
}

async function executeGovernanceProposal(governor, targets, values, calldatas, description, accounts, maxAccounts, network) {
    // 1. Get current block
    const currentBlock = await ethers.provider.getBlock("latest");
    console.log(`Current block time: ${currentBlock.timestamp}`);

    // 2. Create proposal
    console.log('Creating proposal...');
    const proposeTx = await governor.propose(
        targets,
        values,
        calldatas,
        description,
        { gasLimit: 500000 }
    );
    const proposeReceipt = await proposeTx.wait();
    const proposalId = proposeReceipt.logs.find(log => {
        try {
            const parsed = governor.interface.parseLog(log);
            return parsed.name === 'ProposalCreated';
        } catch {
            return false;
        }
    }).args.proposalId;
    console.log(`Proposal created with ID: ${proposalId}`);

    // 3. Get proposal details (try proposals mapping, fallback to votingPeriod)
    let proposal;
    try {
        proposal = await governor.proposals(proposalId);
    } catch {
        proposal = {};
    }
    let votingPeriodSec;
    if (proposal.startTime && proposal.endTime) {
        votingPeriodSec = proposal.endTime - proposal.startTime;
        console.log(`Proposal start: ${proposal.startTime}`);
        console.log(`Proposal end: ${proposal.endTime}`);
    } else {
        // fallback: use votingPeriod blocks * average block time (assume 1s for dev)
        const votingPeriodBlocks = await governor.votingPeriod();
        votingPeriodSec = Number(votingPeriodBlocks);
        console.log(`Voting period (blocks): ${votingPeriodBlocks}`);
    }

    // 4. Get voting delay and mine enough blocks to activate proposal
    let votingDelay;
    try {
        votingDelay = await governor.votingDelay();
        console.log(`Voting delay: ${votingDelay} blocks`);
    } catch {
        votingDelay = 1; // fallback
    }

    // Mine voting delay + 1 blocks to ensure proposal is active
    for (let i = 0; i <= Number(votingDelay); i++) {
        await network.provider.send("evm_mine");
    }

    let state = await governor.state(proposalId);
    console.log(`Proposal state after mining ${Number(votingDelay) + 1} blocks: ${state}`); // Should be 1 (Active)

    // If still not active, mine a few more blocks
    let attempts = 0;
    while (state !== 1 && attempts < 10) {
        await network.provider.send("evm_mine");
        state = await governor.state(proposalId);
        attempts++;
        console.log(`Additional block mined, state: ${state}, attempt: ${attempts}`);
    }

    if (state !== 1) {
        console.log(`⚠️ Proposal not active after ${attempts + Number(votingDelay) + 1} blocks. State: ${state} (${getStateName(state)})`);
        console.log('Attempting to proceed anyway...');
    } else {
        console.log('✅ Proposal is now active and ready for voting');
    }

    // 5. Vote with available accounts
    console.log('Voting on proposal...');
    const availableAccounts = Math.min(maxAccounts, accounts.length);
    for (let j = 0; j < availableAccounts; j++) {
        try {
            // Check if account exists and has voting power
            if (accounts[j]) {
                const votingPower = await governor.getVotes(accounts[j].address, await governor.proposalSnapshot(proposalId));
                console.log(`Account ${j} voting power: ${votingPower}`);

                if (votingPower > 0) {
                    const voteTx = await governor.connect(accounts[j]).castVote(proposalId, 1, { gasLimit: 200000 });
                    await voteTx.wait();
                    console.log(`Account ${j} voted successfully`);
                } else {
                    console.log(`Account ${j} has no voting power, skipping`);
                }
            }
        } catch (error) {
            console.error(`Failed to vote with account ${j}:`, error.message);
            // Continue with other accounts instead of failing completely
        }
    }

    // 6. Calculate exact time remaining in voting period
    const afterVoteBlock = await ethers.provider.getBlock("latest");
    let timeElapsed;
    let timeRemaining;
    if (proposal.startTime && proposal.endTime) {
        timeElapsed = afterVoteBlock.timestamp - proposal.startTime;
        timeRemaining = proposal.endTime - afterVoteBlock.timestamp;
    } else {
        // fallback: use votingPeriodSec
        timeElapsed = 0;
        timeRemaining = votingPeriodSec - 1;
    }
    console.log(`Voting period: ${votingPeriodSec} seconds`);
    console.log(`Time elapsed: ${timeElapsed} seconds`);
    console.log(`Time remaining: ${timeRemaining} seconds`);

    // 7. Fast-forward to just before voting ends
    if (timeRemaining > 1) {
        console.log(`Fast-forwarding ${timeRemaining - 1} seconds`);
        await network.provider.send("evm_increaseTime", [timeRemaining - 1]);
        await network.provider.send("evm_mine");
    }

    // 8. Mine enough blocks to end the voting period (ensure proposal moves to Succeeded)
    let votingBlocks = 20; // fallback default
    try {
        votingBlocks = Number(await governor.votingPeriod());
    } catch { }
    for (let i = 0; i < votingBlocks + 2; i++) {
        await network.provider.send("evm_mine");
    }
    state = await governor.state(proposalId);
    console.log(`Proposal state after deadline: ${state} (${getStateName(state)})`); // Should be 4 (Succeeded)

    // Debug voting results
    try {
        const proposalVotes = await governor.proposalVotes(proposalId);
        console.log(`Voting results - For: ${proposalVotes.forVotes}, Against: ${proposalVotes.againstVotes}, Abstain: ${proposalVotes.abstainVotes}`);

        const quorum = await governor.quorum(await governor.proposalSnapshot(proposalId));
        console.log(`Quorum required: ${quorum}`);
        console.log(`Votes for >= quorum: ${proposalVotes.forVotes >= quorum}`);


    } catch (error) {
        console.log('Could not get detailed voting results:', error.message);
    }

    // 9. Queue the proposal
    console.log('Queueing proposal...');
    const descriptionHash = ethers.id(description);
    state = await governor.state(proposalId);
    const currentBlockTs = (await ethers.provider.getBlock('latest')).timestamp;
    const snapshot = await governor.proposalSnapshot(proposalId);
    const deadline = await governor.proposalDeadline(proposalId);
    console.log("Proposal ID:", proposalId.toString());
    console.log("State before queue:", state);
    console.log("Description hash:", descriptionHash);
    console.log("Current block timestamp:", currentBlockTs);
    console.log("Proposal snapshot:", snapshot);
    console.log("Proposal deadline:", deadline);
    if (Number(state) !== 4) {
        console.log(`⚠️ Proposal state is ${state} (${getStateName(Number(state))}), expected 4 (Succeeded)`);
        throw new Error(`Proposal not in Succeeded state before queue. State: ${state} (${getStateName(Number(state))})`);
    }
    console.log("✅ Proposal is in Succeeded state, proceeding to queue...");
    const queueTx = await governor.queue(
        targets,
        values,
        calldatas,
        descriptionHash,
        { gasLimit: 500000 }
    );
    await queueTx.wait();

    // 10. Fast-forward timelock delay
    const timelock = await ethers.getContractAt("TimelockController", await governor.timelock());
    const delay = await timelock.getMinDelay();
    console.log(`Fast-forwarding ${delay} seconds for timelock...`);
    await network.provider.send("evm_increaseTime", [Number(delay) + 1]);
    await network.provider.send("evm_mine");

    // 11. Execute proposal
    state = await governor.state(proposalId);
    console.log("State before execute:", state);
    if (Number(state) !== 5) {
        console.log(`⚠️ Proposal state is ${state} (${getStateName(Number(state))}), expected 5 (Queued)`);
        throw new Error(`Proposal not in Queued state before execute. State: ${state} (${getStateName(Number(state))})`);
    }
    console.log("✅ Proposal is in Queued state, proceeding to execute...");
    console.log('Executing proposal...');
    const executeTx = await governor.execute(
        targets,
        values,
        calldatas,
        descriptionHash,
        { gasLimit: 500000 }
    );
    await executeTx.wait();

    // 12. Verify final state
    state = await governor.state(proposalId);
    console.log(`Final proposal state: ${state}`); // Should be 7 (Executed)
}

function getStateName(state) {
    const states = [
        "Pending",
        "Active",
        "Canceled",
        "Defeated",
        "Succeeded",
        "Queued",
        "Expired",
        "Executed"
    ];
    return states[state] || "Unknown";
}

// Helper to generate a unique description for each proposal
function makeUniqueDescription(base) {
    return base + ' [' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + ']';
}

// Helper: BigInt square root for quadratic voting
function sqrtBigInt(n) {
    if (n < 0n) throw 'square root of negative numbers is not supported';
    if (n < 2n) return n;
    function newtonIteration(n, x0) {
        const x1 = (x0 + n / x0) >> 1n;
        if (x0 === x1 || x0 === x1 - 1n) return x0;
        return newtonIteration(n, x1);
    }
    return newtonIteration(n, 1n);
}

async function main() {
    console.log("🔧 Main function started");
    
    let deployer, accounts;
    try {
        accounts = await ethers.getSigners();

        if (accounts.length === 0) {
            throw new Error(`No accounts configured for network "${network.name}". Please check your .env file and ensure PRIVATE_KEY is set for testnet deployments.`);
        }

        [deployer] = accounts;
        console.log("✅ Got signers successfully");
        console.log("Deploying with account:", deployer.address);
        console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

        if (network.name !== 'localhost' && network.name !== 'hardhat') {
            const balance = await ethers.provider.getBalance(deployer.address);
            if (balance === 0n) {
                console.log("⚠️ WARNING: Deployer account has 0 ETH balance. Make sure to fund it before deployment.");
            }
        }
    } catch (error) {
        console.error("❌ Failed to get signers:", error);
        throw error;
    }

    // 1. Deploy TimelockController first
    console.log("🏗️  Step 1: Deploying TimelockController");
    const minDelay = 3600; // 1 hour
    const proposers = [deployer.address];
    const executors = [ethers.ZeroAddress];
    
    let TimelockController, timelock;
    try {
        TimelockController = await ethers.getContractFactory("TimelockController");
        console.log("✅ TimelockController factory created");
        
        timelock = await TimelockController.deploy(minDelay, proposers, executors, deployer.address);
        console.log("✅ TimelockController deployment transaction sent");
        
        await timelock.waitForDeployment();
        console.log("✅ TimelockController deployment confirmed");
        
        const timelockAddress = await timelock.getAddress();
        console.log("TimelockController deployed at:", timelockAddress);
        console.log(`[DEPLOYED] TimelockController at: ${timelockAddress} (new deployment)`);
    } catch (error) {
        console.error("❌ Failed to deploy TimelockController:", error);
        throw error;
    }

    // 2. Deploy VotingToken with Timelock as DAO
    const VotingToken = await ethers.getContractFactory("VotingToken");
    const votingToken = await VotingToken.deploy(await timelock.getAddress());
    await votingToken.waitForDeployment();
    console.log("VotingToken deployed at:", await votingToken.getAddress());
    console.log(`[DEPLOYED] VotingToken at: ${await votingToken.getAddress()} (new deployment)`);

    // Grant MINTER_ROLE to TimelockController immediately after deployment
    const MINTER_ROLE = await votingToken.MINTER_ROLE();
    console.log('Granting MINTER_ROLE to TimelockController...');
    const grantMinterTx = await votingToken.grantRole(MINTER_ROLE, await timelock.getAddress(), { gasLimit: 1000000 });
    await grantMinterTx.wait();
    console.log('VotingToken MINTER_ROLE granted to TimelockController:', await votingToken.hasRole(MINTER_ROLE, await timelock.getAddress()));

    // Grant DEFAULT_ADMIN_ROLE to TimelockController
    const DEFAULT_ADMIN_ROLE = await votingToken.DEFAULT_ADMIN_ROLE();
    console.log('Granting DEFAULT_ADMIN_ROLE to TimelockController...');
    const grantAdminTx = await votingToken.grantRole(DEFAULT_ADMIN_ROLE, await timelock.getAddress(), { gasLimit: 1000000 });
    await grantAdminTx.wait();
    console.log('VotingToken DEFAULT_ADMIN_ROLE granted to TimelockController:', await votingToken.hasRole(DEFAULT_ADMIN_ROLE, await timelock.getAddress()));
    console.log('VotingToken DAO:', await votingToken.dao());

    // 3. Deploy ProtocolGovernor
    const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
    const governor = await ProtocolGovernor.deploy(await votingToken.getAddress(), await timelock.getAddress());
    await governor.waitForDeployment();
    console.log("ProtocolGovernor deployed at:", await governor.getAddress());
    console.log(`[DEPLOYED] ProtocolGovernor at: ${await governor.getAddress()} (new deployment)`);
    // Grant MINTER_ROLE to Governor immediately after deployment
    console.log('Granting MINTER_ROLE to Governor...');
    const grantMinterToGovTx = await votingToken.grantRole(MINTER_ROLE, await governor.getAddress(), { gasLimit: 1000000 });
    await grantMinterToGovTx.wait();
    
    // Set DAO to Governor immediately after deployment
    console.log('Setting DAO to Governor...');
    const setDAOTx = await votingToken.setDAO(await governor.getAddress(), { gasLimit: 1000000 });
    await setDAOTx.wait();
    
    // Debug prints for role assignment
    const hasMinterRole = await votingToken.hasRole(MINTER_ROLE, await governor.getAddress());
    console.log('MINTER_ROLE:', MINTER_ROLE);
    console.log('Governor address:', await governor.getAddress());
    console.log('VotingToken has MINTER_ROLE for Governor:', hasMinterRole);
    
    // Grant PROPOSER_ROLE to Governor on TimelockController
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    console.log('Granting PROPOSER_ROLE to Governor...');
    const grantProposerTx = await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress(), { gasLimit: 1000000 });
    await grantProposerTx.wait();
    console.log('TimelockController PROPOSER_ROLE granted to Governor:', await timelock.hasRole(PROPOSER_ROLE, await governor.getAddress()));

    // Grant roles on TimelockController
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    // Grant EXECUTOR_ROLE to AddressZero (anyone can execute after delay)
    console.log('Granting EXECUTOR_ROLE to AddressZero...');
    const grantExecutorTx = await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress, { gasLimit: 1000000 });
    await grantExecutorTx.wait();

    // DON'T revoke admin role from deployer yet - do it at the very end
    // await timelock.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address); // REMOVE THIS LINE

    // Verify roles
    const governorIsProposer = await timelock.hasRole(PROPOSER_ROLE, await governor.getAddress());
    const zeroIsExecutor = await timelock.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress);
    if (!governorIsProposer || !zeroIsExecutor) {
        throw new Error("Timelock roles not properly configured!");
    }
    console.log('TimelockController roles verified:');
    console.log('  PROPOSER_ROLE (Governor):', governorIsProposer);
    console.log('  EXECUTOR_ROLE (AddressZero):', zeroIsExecutor);
    // Add event listeners for debugging
    timelock.on("CallScheduled", (id, index, target, value, data, predecessor, delay) => {
        console.log("CallScheduled:", { id, target, value: value.toString(), delay: delay.toString() });
    });
    timelock.on("CallExecuted", (id, index, target, value, data) => {
        console.log("CallExecuted:", { id, target, value: value.toString() });
    });

    // 4. Deploy MockPriceFeed for GlintToken
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");

    // Deploy MockPriceFeed for USDC with initial price of 1.00 and 8 decimals
    console.log("\nDeploying MockPriceFeed for USDC...");
    const usdcMockFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.00", 18),
        8
    );
    await usdcMockFeed.waitForDeployment();
    const usdcMockFeedAddress = await usdcMockFeed.getAddress();
    console.log("MockPriceFeed for USDC deployed to:", usdcMockFeedAddress);

    // Deploy MockPriceFeed for USDT with initial price of 1.00 and 8 decimals
    console.log("\nDeploying MockPriceFeed for USDT...");
    const usdtMockFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.00", 18),
        8
    );
    await usdtMockFeed.waitForDeployment();
    const usdtMockFeedAddress = await usdtMockFeed.getAddress();
    console.log("MockPriceFeed for USDT deployed to:", usdtMockFeedAddress);

    // 5. Deploy protocol contracts with Timelock as admin
    console.log("Deploying StablecoinManager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(await timelock.getAddress());
    await stablecoinManager.waitForDeployment();
    const stablecoinManagerAddress = await stablecoinManager.getAddress();
    console.log("StablecoinManager:", stablecoinManagerAddress);
    console.log(`[DEPLOYED] StablecoinManager at: ${stablecoinManagerAddress} (new deployment)`);

    // --- PATCHED: Use real initialization parameters for InterestRateModel ---
    const initializationParams = [
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // Chainlink ETH/USD Oracle (mainnet)
        await timelock.getAddress(), // Timelock contract
        "50000000000000000", // 5% baseRate (0.05 * 1e18)
        "800000000000000000", // 80% kink (0.8 * 1e18)
        "100000000000000000", // 10% slope1 (0.1 * 1e18)
        "300000000000000000", // 30% slope2 (0.3 * 1e18)
        "100000000000000000", // 10% reserveFactor (0.1 * 1e18)
        "1000000000000000000", // 100% maxBorrowRate (1.0 * 1e18)
        "50000000000000000", // 5% maxRateChange (0.05 * 1e18)
        "30000000000000000", // 3% ethPriceRiskPremium (0.03 * 1e18)
        "200000000000000000", // 20% ethVolatilityThreshold (0.2 * 1e18)
        86400 // 24h oracleStalenessWindow (in seconds)
    ];
    console.log("Deploying InterestRateModel...");
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy(...initializationParams);
    await interestRateModel.waitForDeployment();
    const interestRateModelAddress = await interestRateModel.getAddress();
    console.log("InterestRateModel:", interestRateModelAddress);
    console.log(`[DEPLOYED] InterestRateModel at: ${interestRateModelAddress} (new deployment)`);

    // 6. Deploy LiquidityPool with DAO as admin
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        deployer.address, // LOCAL/DEV: deployer is admin
        stablecoinManagerAddress,
        ethers.ZeroAddress, // LendingManager placeholder
        interestRateModelAddress,
    ], {
        initializer: "initialize",
    });
    await liquidityPool.waitForDeployment();
    console.log("LiquidityPool deployed at:", await liquidityPool.getAddress());

    // 7. Deploy LendingManager
    console.log("\nDeploying LendingManager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(await liquidityPool.getAddress(), await timelock.getAddress());
    await lendingManager.waitForDeployment();
    console.log("LendingManager deployed at:", await lendingManager.getAddress());
    console.log(`[DEPLOYED] LendingManager at: ${await lendingManager.getAddress()} (new deployment)`);

    // 7.1 Set credit scores for test accounts (only on localhost)
    console.log('Setting credit scores for test accounts...');
    if (network.name === 'localhost' || network.name === 'hardhat') {
        if (accounts.length >= 3) {
            const lender = accounts[1];
            const borrower = accounts[2];

            console.log('Lender account:', lender.address);
            console.log('Borrower account:', borrower.address);

            const setCreditScore1Tx = await liquidityPool.setCreditScore(lender.address, 85, { gasLimit: 100000 });
            await setCreditScore1Tx.wait();

            const setCreditScore2Tx = await liquidityPool.setCreditScore(borrower.address, 80, { gasLimit: 100000 });
            await setCreditScore2Tx.wait();

            console.log(`✅ Set credit scores: lender (${lender.address}) = 85, borrower (${borrower.address}) = 80`);
        } else {
            console.log('⚠️ Not enough accounts available for setting credit scores (need at least 3 accounts)');
        }
    } else {
        console.log('⚠️ Skipping credit score setup on testnet/mainnet (use governance instead)');
    }

    // 7.2 Setup Credit Score Contract (BEFORE transferring admin to timelock)
    console.log('\n🔗 Setting up RISC0 Credit Score integration...');
    
    const RISC0_CREDIT_SCORE_ADDRESS = "0xE3F3a75ef923023FFeb9a502c3Bc7dF30c334B6a"; // actual RISC0 contract
    
    // Option B: Deploy a simple mock contract for testing
    // const MockCreditScore = await ethers.getContractFactory("MockCreditScore");
    // const mockCreditScore = await MockCreditScore.deploy();
    // await mockCreditScore.waitForDeployment();
    // const RISC0_CREDIT_SCORE_ADDRESS = await mockCreditScore.getAddress();
    
    try {
        if (RISC0_CREDIT_SCORE_ADDRESS && RISC0_CREDIT_SCORE_ADDRESS !== "0x0000000000000000000000000000000000000000") {
            console.log('Setting credit score contract to:', RISC0_CREDIT_SCORE_ADDRESS);
            
            // Set the credit score contract (deployer is still admin at this point)
            const setCreditScoreTx = await liquidityPool.setCreditScoreContract(
                RISC0_CREDIT_SCORE_ADDRESS,
                { gasLimit: 200000 }
            );
            await setCreditScoreTx.wait();
            
            // Verify it was set
            const currentCreditScoreContract = await liquidityPool.creditScoreContract();
            const risc0Enabled = await liquidityPool.useRISC0CreditScores();
            
            console.log('✅ Credit score contract set to:', currentCreditScoreContract);
            console.log('✅ RISC0 scores enabled:', risc0Enabled);
            
            // Optional: Set up other RISC0-related configurations
            // await liquidityPool.toggleRISC0CreditScores(true); // Already auto-enabled
            
        } else {
            console.log('⚠️ No RISC0 credit score contract address provided, skipping setup');
        }
    } catch (error) {
        console.error('❌ Failed to set credit score contract:', error.message);
        console.log('⚠️ Continuing deployment, you can set this later via governance');
    }

    // 7.3 Setup other initial configurations while deployer is still admin
    console.log('\n⚙️ Setting up additional configurations...');
    
    try {
        // Set VotingToken reference in LiquidityPool (if needed)
        if (await liquidityPool.votingToken && (await liquidityPool.votingToken()) === ethers.ZeroAddress) {
            console.log('Setting VotingToken in LiquidityPool...');
            await liquidityPool.setVotingToken(await votingToken.getAddress());
            console.log('✅ VotingToken set in LiquidityPool');
        }
        
        // Add LiquidityPool to governor's contract whitelist (for future governance)
        console.log('Whitelisting LiquidityPool in ProtocolGovernor...');
        // Note: This requires governance, so we'll do it via executeGovernanceProposal
        
        // Price feeds and collateral are now set up before admin transfer
        
    } catch (error) {
        console.error('❌ Error in additional setup:', error.message);
        console.log('⚠️ Some configurations may need to be set manually later');
    }

    // 7.4 Use governance to whitelist LiquidityPool (required for governance)
    console.log('\n🏛️ Setting up governance configurations...');

    try {
        // Skip governance setup on testnets/mainnet for security
        if (network.name !== 'localhost' && network.name !== 'hardhat') {
            console.log('⚠️ Skipping governance whitelist setup on testnet/mainnet');
            console.log('⚠️ You may need to whitelist LiquidityPool manually later via governance');
            console.log('🔄 Continuing with deployment...');
        } else {
            // Simplified governance setup with very low quorum (1 vote)
            console.log('Setting up minimal governance for whitelist...');
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            const hasRole = await votingToken.hasRole(MINTER_ROLE, deployer.address);

        if (!hasRole) {
            console.log('Granting MINTER_ROLE to deployer...');
            await votingToken.grantRole(MINTER_ROLE, deployer.address);
        }

        // Mint minimal tokens for testing
        const currentQuorum = await governor.quorum(await ethers.provider.getBlockNumber());
        const tokensToMint = currentQuorum + 5n;

        await votingToken.mint(deployer.address, tokensToMint);
        await votingToken.connect(deployer).delegate(deployer.address);

        // Wait for delegation to take effect
        console.log('Waiting for delegation to take effect...');
        await network.provider.send("evm_mine");
        await network.provider.send("evm_mine");



        // Create a governance proposal to whitelist LiquidityPool
        const whitelistCalldata = governor.interface.encodeFunctionData(
            "setContractWhitelist",
            [await liquidityPool.getAddress(), true]
        );

        // Use the executeGovernanceProposal helper with just the deployer
        await executeGovernanceProposal(
            governor,
            [await governor.getAddress()], // target: governor itself
            [0], // values
            [whitelistCalldata], // calldata
            makeUniqueDescription("Whitelist LiquidityPool for governance"),
            [deployer], // just use deployer account
            1, // use 1 account
            network
        );

        console.log('✅ LiquidityPool whitelisted for governance proposals');
        }

    } catch (error) {
        console.error('❌ Failed to setup governance whitelist:', error.message);
        console.error('Full error:', error);

        // Try alternative approach: direct whitelist while deployer is still admin
        try {
            console.log('🔄 Attempting direct whitelist as fallback...');
            // Check if governor has a direct setContractWhitelist function we can call
            const hasDirectFunction = governor.interface.fragments.some(f => f.name === 'setContractWhitelist');
            if (hasDirectFunction) {
                await governor.setContractWhitelist(await liquidityPool.getAddress(), true);
                console.log('✅ LiquidityPool whitelisted directly (fallback method)');
            } else {
                console.log('⚠️ No direct whitelist method available');
            }
        } catch (fallbackError) {
            console.log('⚠️ Fallback method also failed:', fallbackError.message);
        }

        console.log('⚠️ You may need to whitelist LiquidityPool manually later via governance');
        console.log('🔄 Continuing with deployment...');
    }


    // 8. Update LiquidityPool with LendingManager address (deployer is admin)
    console.log("Updating LiquidityPool with LendingManager address...");
    await liquidityPool.setLendingManager(await lendingManager.getAddress());
    console.log("LiquidityPool updated.");

    // 8.1. Deploy GlintToken
    console.log("\n📦 Deploying GlintToken...");
    const GlintToken = await ethers.getContractFactory("GlintToken");
    const glintToken = await GlintToken.deploy(ethers.parseEther('1000000'));
    await glintToken.waitForDeployment();
    const glintTokenAddress = await glintToken.getAddress();
    console.log("GlintToken deployed at:", glintTokenAddress);

    // 8.2. Deploy MockPriceFeed for GlintToken
    console.log("Deploying MockPriceFeed for GlintToken...");
    const glintMockFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("1.00", 8), // 1.00 with 8 decimals
        8
    );
    await glintMockFeed.waitForDeployment();
    const glintMockFeedAddress = await glintMockFeed.getAddress();
    console.log("MockPriceFeed for GlintToken deployed to:", glintMockFeedAddress);

    // 8.3. Setup GLINT token as collateral (BEFORE transferring admin to timelock)
    console.log("\n⚙️  Setting up GLINT token as collateral...");
    try {
        // Set up GLINT as allowed collateral
        await liquidityPool.setAllowedCollateral(glintTokenAddress, true);
        console.log("✅ GLINT token allowed as collateral");

        // Set up price feed for GLINT
        await liquidityPool.setPriceFeed(glintTokenAddress, glintMockFeedAddress);
        console.log("✅ Price feed set for GLINT token");
    } catch (error) {
        console.error("❌ Failed to setup GLINT collateral:", error.message);
        throw error;
    }

    console.log("  Setting credit score contract...");
    const creditScoreAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // NOTE: CHANGE WITH ACTUAL ADDRESS, OR MOVE THE CONTRACT INTO THIS PROJECT FOLDER TO USE IT DYNAMICALLY
    await liquidityPool.setCreditScoreContract(creditScoreAddress);
    console.log("  ✅ Credit score contract set to:", creditScoreAddress);

    // 9. Transfer LiquidityPool admin to Timelock (for full governance)
    console.log("\nTransferring LiquidityPool admin to Timelock...");
    await liquidityPool.setAdmin(await timelock.getAddress());
    console.log("LiquidityPool admin transferred to Timelock.");

    // Output all addresses
    console.log("\nDeployment complete:");
    console.log("VotingToken:", await votingToken.getAddress());
    console.log("TimelockController:", await timelock.getAddress());
    console.log("ProtocolGovernor:", await governor.getAddress());
    console.log("StablecoinManager:", stablecoinManagerAddress);
    console.log("InterestRateModel:", interestRateModelAddress);
    console.log("LiquidityPool:", await liquidityPool.getAddress());
    console.log("LendingManager:", await lendingManager.getAddress());
    console.log("GlintToken:", glintTokenAddress);
    console.log("MockPriceFeed (Glint):", glintMockFeedAddress);
    console.log("MockPriceFeed USDC:", await usdcMockFeed.getAddress());
    console.log("MockPriceFeed USDT:", await usdtMockFeed.getAddress());

    // Optionally update frontend/app addresses
    const addressesObj = {
        VotingToken: await votingToken.getAddress(),
        TimelockController: await timelock.getAddress(),
        ProtocolGovernor: await governor.getAddress(),
        StablecoinManager: stablecoinManagerAddress,
        InterestRateModel: interestRateModelAddress,
        LiquidityPool: await liquidityPool.getAddress(),
        LendingManager: await lendingManager.getAddress(),
        GlintToken: glintTokenAddress,
        MockPriceFeed: glintMockFeedAddress,
        MockPriceFeedUSDC: await usdcMockFeed.getAddress(),
        MockPriceFeedUSDT: await usdtMockFeed.getAddress()
    };
    // Also write to frontend/src/addresses.json for compatibility
    const fs = require('fs');
    const path = require('path');
    try {
        fs.writeFileSync(path.join(__dirname, '../../frontend/addresses.json'), JSON.stringify(addressesObj, null, 2));
        fs.writeFileSync(path.join(__dirname, '../../frontend/src/addresses.json'), JSON.stringify(addressesObj, null, 2));
        console.log('Wrote addresses to frontend/addresses.json and frontend/src/addresses.json');
        // Copy ABIs to frontend/src/abis
        execSync(`node "${path.join(__dirname, 'copy-artifacts.js')}"`, { stdio: 'inherit' });
    } catch (e) {
        console.error('Failed to write addresses to frontend/addresses.json or frontend/src/addresses.json:', e.message);
    }

    // Update frontend contract addresses file
    const frontendAddressesPath = path.join(__dirname, '../../frontend/src/contractAddresses.js');
    const addressesContent = `// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost: ${JSON.stringify(addressesObj, null, 4)},
  sepolia: {
    // Add Sepolia addresses when deployed
  },
  sonic: {
    // Add Sonic addresses when deployed
  }
};

export const getContractAddresses = (networkName) => {
  return CONTRACT_ADDRESSES[networkName] || CONTRACT_ADDRESSES.localhost;
};
`;

    try {
        fs.writeFileSync(frontendAddressesPath, addressesContent);
        console.log('✅ Updated frontend/src/contractAddresses.js');
    } catch (e) {
        console.error('❌ Failed to update frontend contract addresses:', e.message);
    }

    // At the very end, after all setup is complete, revoke admin roles
    console.log("\nFinalizing permissions...");

    // Revoke DEFAULT_ADMIN_ROLE from deployer on VotingToken (only if timelock has it)
    const timelockHasVotingTokenAdmin = await votingToken.hasRole(DEFAULT_ADMIN_ROLE, await timelock.getAddress());
    if (timelockHasVotingTokenAdmin) {
        try {
            await votingToken.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address);
            console.log("✅ Revoked VotingToken admin role from deployer");
        } catch (e) {
            console.log("⚠️ Could not revoke VotingToken admin role:", e.message);
        }
    }

    timelock.removeAllListeners();
}

// Run main function if this script is executed directly
if (require.main === module) {
    main()
        .then(() => {
            console.log("✅ Deployment completed successfully");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ Deployment failed:");
            console.error(error);
            process.exit(1);
        });
}

module.exports = { main };