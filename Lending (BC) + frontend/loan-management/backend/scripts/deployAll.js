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

const iface = new ethers.utils.Interface([
    "function setPriceFeed(address asset, address feed)",
    "function setAllowedContract(address contractAddr, bool allowed)",
    "function setQuorumPercentage(uint256)"
]);
// EVM time sanity check and short periods for local testing
// (Removed: now handled in mockTransactions.js)

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
    const proposalId = proposeReceipt.events.find(e => e.event === 'ProposalCreated').args.proposalId;
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
        votingPeriodSec = votingPeriodBlocks.toNumber();
        console.log(`Voting period (blocks): ${votingPeriodBlocks}`);
    }

    // 4. Mine exactly 1 block to activate proposal
    await network.provider.send("evm_mine");
    let state = await governor.state(proposalId);
    console.log(`Proposal state: ${state}`); // Should be 1 (Active)

    // 5. Vote immediately with all accounts
    console.log('Voting on proposal...');
    for (let j = 0; j < maxAccounts; j++) {
        const voteTx = await governor.connect(accounts[j]).castVote(proposalId, 1, { gasLimit: 200000 });
        await voteTx.wait();
        console.log(`Account ${j} voted`);
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
        votingBlocks = (await governor.votingPeriod()).toNumber();
    } catch { }
    for (let i = 0; i < votingBlocks + 2; i++) {
        await network.provider.send("evm_mine");
    }
    state = await governor.state(proposalId);
    console.log(`Proposal state after deadline: ${state}`); // Should be 4 (Succeeded)

    // 9. Queue the proposal
    console.log('Queueing proposal...');
    const descriptionHash = ethers.utils.id(description);
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
    if (state !== 4) throw new Error("Proposal not in Succeeded state before queue");
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
    await network.provider.send("evm_increaseTime", [delay.toNumber() + 1]);
    await network.provider.send("evm_mine");

    // 11. Execute proposal
    state = await governor.state(proposalId);
    console.log("State before execute:", state);
    if (state !== 5) throw new Error("Proposal not in Queued state before execute");
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
    const [deployer] = await ethers.getSigners();
    const accounts = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    // 1. Deploy TimelockController first
    const minDelay = 3600; // 1 hour
    const proposers = [deployer.address];
    const executors = [ethers.constants.AddressZero];
    const TimelockController = await ethers.getContractFactory("TimelockController");
    const timelock = await TimelockController.deploy(minDelay, proposers, executors, deployer.address);
    await timelock.deployed();
    console.log("TimelockController deployed at:", timelock.address);
    console.log(`[DEPLOYED] TimelockController at: ${timelock.address} (new deployment)`);

    // 2. Deploy VotingToken with Timelock as DAO
    const VotingToken = await ethers.getContractFactory("VotingToken");
    const votingToken = await VotingToken.deploy(timelock.address);
    await votingToken.deployed();
    console.log("VotingToken deployed at:", votingToken.address);
    console.log(`[DEPLOYED] VotingToken at: ${votingToken.address} (new deployment)`);

    // Grant MINTER_ROLE to TimelockController immediately after deployment
    const MINTER_ROLE = await votingToken.MINTER_ROLE();
    await votingToken.grantRole(MINTER_ROLE, timelock.address);
    console.log('VotingToken MINTER_ROLE granted to TimelockController:', await votingToken.hasRole(MINTER_ROLE, timelock.address));

    // Grant DEFAULT_ADMIN_ROLE to TimelockController
    const DEFAULT_ADMIN_ROLE = await votingToken.DEFAULT_ADMIN_ROLE();
    await votingToken.grantRole(DEFAULT_ADMIN_ROLE, timelock.address);
    console.log('VotingToken DEFAULT_ADMIN_ROLE granted to TimelockController:', await votingToken.hasRole(DEFAULT_ADMIN_ROLE, timelock.address));
    console.log('VotingToken DAO:', await votingToken.dao());

    // 3. Deploy ProtocolGovernor
    const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
    const governor = await ProtocolGovernor.deploy(votingToken.address, timelock.address);
    await governor.deployed();
    console.log("ProtocolGovernor deployed at:", governor.address);
    console.log(`[DEPLOYED] ProtocolGovernor at: ${governor.address} (new deployment)`);
    // Grant MINTER_ROLE to Governor immediately after deployment
    await votingToken.grantRole(MINTER_ROLE, governor.address);
    // Set DAO to Governor immediately after deployment
    await votingToken.setDAO(governor.address);
    // Debug prints for role assignment
    const hasMinterRole = await votingToken.hasRole(MINTER_ROLE, governor.address);
    console.log('MINTER_ROLE:', MINTER_ROLE);
    console.log('Governor address:', governor.address);
    console.log('VotingToken has MINTER_ROLE for Governor:', hasMinterRole);
    // Grant PROPOSER_ROLE to Governor on TimelockController
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    await timelock.grantRole(PROPOSER_ROLE, governor.address);
    console.log('TimelockController PROPOSER_ROLE granted to Governor:', await timelock.hasRole(PROPOSER_ROLE, governor.address));

    // Grant roles on TimelockController
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    // Grant EXECUTOR_ROLE to AddressZero (anyone can execute after delay)
    await timelock.grantRole(EXECUTOR_ROLE, ethers.constants.AddressZero);
    // Revoke admin role from deployer
    await timelock.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address);
    // Verify roles
    const governorIsProposer = await timelock.hasRole(PROPOSER_ROLE, governor.address);
    const zeroIsExecutor = await timelock.hasRole(EXECUTOR_ROLE, ethers.constants.AddressZero);
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
        ethers.utils.parseUnits("1.00", 18),
        8
    );
    await usdcMockFeed.deployed();
    const usdcMockFeedAddress = await usdcMockFeed.address;
    console.log("MockPriceFeed for USDC deployed to:", usdcMockFeedAddress);

    // Deploy MockPriceFeed for USDT with initial price of 1.00 and 8 decimals
    console.log("\nDeploying MockPriceFeed for USDT...");
    const usdtMockFeed = await MockPriceFeed.deploy(
        ethers.utils.parseUnits("1.00", 18),
        8
    );
    await usdtMockFeed.deployed();
    const usdtMockFeedAddress = await usdtMockFeed.address;
    console.log("MockPriceFeed for USDT deployed to:", usdtMockFeedAddress);

    // 5. Deploy protocol contracts with Timelock as admin
    console.log("Deploying StablecoinManager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(timelock.address);
    await stablecoinManager.deployed();
    const stablecoinManagerAddress = stablecoinManager.address;
    console.log("StablecoinManager:", stablecoinManagerAddress);
    console.log(`[DEPLOYED] StablecoinManager at: ${stablecoinManagerAddress} (new deployment)`);

    // --- PATCHED: Use real initialization parameters for InterestRateModel ---
    const initializationParams = [
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // Chainlink ETH/USD Oracle (mainnet)
        timelock.address, // Timelock contract
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
    await interestRateModel.deployed();
    const interestRateModelAddress = interestRateModel.address;
    console.log("InterestRateModel:", interestRateModelAddress);
    console.log(`[DEPLOYED] InterestRateModel at: ${interestRateModelAddress} (new deployment)`);

    // 6. Deploy IntegratedCreditSystem first (as before)
    const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
    const creditSystem = await IntegratedCreditSystem.deploy(
        ethers.constants.AddressZero, // SimpleRISC0Test placeholder
        ethers.constants.AddressZero  // LiquidityPool placeholder
    );
    await creditSystem.deployed();
    console.log("IntegratedCreditSystem deployed at:", creditSystem.address);

    // Deploy LiquidityPool with DAO as admin and creditSystem address as 5th param
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        deployer.address, // LOCAL/DEV: deployer is admin
        stablecoinManagerAddress,
        ethers.constants.AddressZero, // LendingManager placeholder
        interestRateModelAddress,
        creditSystem.address
    ], {
        initializer: "initialize",
    });
    await liquidityPool.deployed();
    console.log("LiquidityPool deployed at:", liquidityPool.address);

    // Set LiquidityPool address in IntegratedCreditSystem (if setter exists)
    if (creditSystem.setLiquidityPool) {
        const tx = await creditSystem.setLiquidityPool(liquidityPool.address);
        await tx.wait();
        console.log("LiquidityPool address set in IntegratedCreditSystem.");
    }

    // 7. Deploy LendingManager
    console.log("Deploying LendingManager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(liquidityPool.address, timelock.address);
    await lendingManager.deployed();
    const lendingManagerAddress = lendingManager.address;
    console.log("LendingManager:", lendingManagerAddress);
    console.log(`[DEPLOYED] LendingManager at: ${lendingManagerAddress} (new deployment)`);

    // 7.1 Set credit scores for two users (lender, borrower) before admin transfer
    const lender = accounts[1];
    const borrower = accounts[2];
    await liquidityPool.setCreditScore(lender.address, 85);
    await liquidityPool.setCreditScore(borrower.address, 80);
    console.log(`Set credit scores: lender (${lender.address}) = 85, borrower (${borrower.address}) = 80`);

    // 8. Update LiquidityPool with LendingManager address (deployer is admin)
    console.log("Updating LiquidityPool with LendingManager address...");
    await liquidityPool.setLendingManager(lendingManager.address);
    console.log("LiquidityPool updated.");

    // 9. Transfer LiquidityPool admin to Timelock (for full governance)
    console.log("Transferring LiquidityPool admin to Timelock...");
    await liquidityPool.setAdmin(timelock.address);
    console.log("LiquidityPool admin transferred to Timelock.");

    // 3. Deploy GlintToken
    const GlintToken = await ethers.getContractFactory("GlintToken");
    const glintToken = await GlintToken.deploy(ethers.utils.parseEther('1000000'));
    await glintToken.deployed();
    const glintTokenAddress = glintToken.address;
    console.log("GlintToken deployed at:", glintTokenAddress);

    // 10. Deploy MockPriceFeed for GlintToken
    console.log("\nDeploying MockPriceFeed for GlintToken...");
    const glintMockFeed = await MockPriceFeed.deploy(
        ethers.utils.parseUnits("1.00", 8), // 1.00 with 8 decimals
        8
    );
    await glintMockFeed.deployed();
    const glintMockFeedAddress = glintMockFeed.address;
    console.log("MockPriceFeed for GlintToken deployed to:", glintMockFeedAddress);

    // (Remove duplicate USDC/USDT MockPriceFeed deployment here, as it was already done above.)

    // Output all addresses
    console.log("\nDeployment complete:");
    console.log("VotingToken:", votingToken.address);
    console.log("TimelockController:", timelock.address);
    console.log("ProtocolGovernor:", governor.address);
    console.log("StablecoinManager:", stablecoinManagerAddress);
    console.log("InterestRateModel:", interestRateModelAddress);
    console.log("LiquidityPool:", liquidityPool.address);
    console.log("LendingManager:", lendingManager.address);
    console.log("GlintToken:", glintToken.address);
    console.log("MockPriceFeed (Glint):", glintMockFeed.address); // <-- Fix here
    console.log("MockPriceFeed USDC:", usdcMockFeed.address);
    console.log("MockPriceFeed USDT:", usdtMockFeed.address);
    console.log("IntegratedCreditSystem:", creditSystem.address);

    // Optionally update frontend/app addresses
    const addressesObj = {
        VotingToken: votingToken.address,
        TimelockController: timelock.address,
        ProtocolGovernor: governor.address,
        StablecoinManager: stablecoinManager.address,
        InterestRateModel: interestRateModel.address,
        LiquidityPool: liquidityPool.address,
        LendingManager: lendingManager.address,
        GlintToken: glintToken.address,
        MockPriceFeed: glintMockFeed.address, // <-- Fix here
        MockPriceFeedUSDC: usdcMockFeed.address,
        MockPriceFeedUSDT: usdtMockFeed.address,
        IntegratedCreditSystem: creditSystem.address
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

    // Revoke DEFAULT_ADMIN_ROLE from deployer after all admin actions are complete
    await votingToken.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address);
    timelock.removeAllListeners();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});