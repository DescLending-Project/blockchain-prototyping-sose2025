const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

async function main() {
    // EVM time sanity check and short periods for local testing
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const block = await provider.getBlock("latest");
    console.log("EVM time at script start:", block.timestamp, new Date(block.timestamp * 1000));
    if (block.timestamp > 2_000_000_000) {
        console.error("\n❌ EVM time is too far in the future (timestamp:", block.timestamp, ").\nPlease restart your Hardhat node to reset the blockchain time before running this script.\n");
        process.exit(1);
    }
    // Use short periods for local testing
    const VOTING_PERIOD = 60; // 60 seconds
    const EXECUTION_DELAY = 60; // 60 seconds
    console.log("[DEV] VOTING_PERIOD set to", VOTING_PERIOD, "seconds");
    console.log("[DEV] EXECUTION_DELAY set to", EXECUTION_DELAY, "seconds");

    // Load deployed contract addresses
    const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, '../../frontend/src/addresses.json')));
    const [deployer, lender1, lender2, borrower1, borrower2, ...others] = await ethers.getSigners();

    // Output wallet info
    const roles = [
        { name: 'deployer', signer: deployer },
        { name: 'lender1', signer: lender1 },
        { name: 'lender2', signer: lender2 },
        { name: 'borrower1', signer: borrower1 },
        { name: 'borrower2', signer: borrower2 },
    ];
    // Try to get private keys from hardhat node (works for local node with known mnemonic)
    // Hardhat exposes private keys for local accounts via hardhat.config.js or node output
    // If not available directly, derive from known mnemonic
    const hardhatMnemonic = "test test test test test test test test test test test test junk";
    let hdNode;
    try {
        hdNode = ethers.Mnemonic.fromPhrase(hardhatMnemonic);
    } catch {
        hdNode = null;
    }

    roles.forEach(({ name, signer }, idx) => {
        // Always derive from mnemonic for local Hardhat accounts
        let pk;
        try {
            if (hdNode) {
                const wallet = ethers.HDNodeWallet.fromMnemonic(hdNode, `m/44'/60'/0'/0/${idx}`);
                pk = wallet.privateKey;
            } else {
                pk = 'N/A';
            }
        } catch {
            pk = 'N/A';
        }
        console.log(`${name}: ${signer.address} | Private Key: ${pk}`);
    });
    others.forEach((signer, idx) => {
        let pk;
        const accountIdx = idx + roles.length;
        try {
            if (hdNode) {
                const wallet = ethers.HDNodeWallet.fromMnemonic(hdNode, `m/44'/60'/0'/0/${accountIdx}`);
                pk = wallet.privateKey;
            } else {
                pk = 'N/A';
            }
        } catch {
            pk = 'N/A';
        }
        console.log(`other${idx + 1}: ${signer.address} | Private Key: ${pk}`);
    });

    // Load ABIs
    const LiquidityPool = await ethers.getContractAt('LiquidityPool', addresses.LiquidityPool);
    const LendingManager = await ethers.getContractAt('LendingManager', addresses.LendingManager);
    const ProtocolGovernor = await ethers.getContractAt('ProtocolGovernor', addresses.ProtocolGovernor);
    const VotingToken = await ethers.getContractAt('VotingToken', addresses.VotingToken);

    // --- Mint voting tokens to as many accounts as possible (up to 10 for dev/test) ---
    // --- Modified Minting Section ---
    // --- Mint voting tokens with guaranteed voting power ---
    const accounts = await ethers.getSigners();
    const VOTERS = [deployer, lender1, lender2, borrower1, borrower2]; // Explicit voters

    // Mint sufficient tokens to ensure quorum (500 total)
    async function safeMint(to, amount) {
        const batches = Math.ceil(amount / 100);
        for (let i = 0; i < batches; i++) {
            const batchAmount = Math.min(amount - (i * 100), 100);
            await VotingToken.mint(to, batchAmount);
        }
        console.log(`Minted ${amount} tokens to ${to}`);
    }

    // Assign voting power (enough to meet quorum)
    await safeMint(deployer.address, 200);   // Deployer gets 200 tokens
    await safeMint(lender1.address, 480);    // Lender1 gets 150
    await safeMint(lender2.address, 300);    // Lender2 gets 100
    await safeMint(borrower1.address, 80);   // Borrower1 gets 80
    await safeMint(borrower2.address, 100);   // Borrower2 gets 100

    // Verify voting power
    for (const voter of VOTERS) {
        const votes = await VotingToken.getVotes(voter.address);
        console.log(`${voter.address} voting power: ${votes}`);
    }
    // Fund the timelock address with ETH so it can pay for gas
    await network.provider.send("hardhat_setBalance", [
        addresses.TimelockController,
        "0x1000000000000000000" // 1 ETH in hex
    ]);

    // Impersonate timelock for admin actions
    const timelockSigner = await ethers.getImpersonatedSigner(addresses.TimelockController);

    // --- Set credit scores for lenders and borrowers ---
    console.log('Mock: Setting credit scores');
    await LiquidityPool.connect(timelockSigner).setCreditScore(lender1.address, 85);
    await LiquidityPool.connect(timelockSigner).setCreditScore(lender2.address, 90);
    await LiquidityPool.connect(timelockSigner).setCreditScore(borrower1.address, 80);
    await LiquidityPool.connect(timelockSigner).setCreditScore(borrower2.address, 75);

    // --- Assume a mock ERC20 token is deployed and whitelisted as collateral ---
    // For this mock, use GlintToken as the collateral token
    const glintTokenAddress = addresses.GlintToken;
    const GlintToken = await ethers.getContractAt('GlintToken', glintTokenAddress);
    // Whitelist GlintToken as collateral (assume timelock/admin role)
    await LiquidityPool.connect(timelockSigner).setAllowedCollateral(glintTokenAddress, true);
    // Transfer GlintToken to borrower1 and approve/deposit as collateral
    await GlintToken.connect(deployer).transfer(borrower1.address, ethers.parseEther('1000'));
    await GlintToken.connect(borrower1).approve(await LiquidityPool.getAddress(), ethers.parseEther('1000'));
    console.log('Mock: Borrower1 deposits 100 GlintToken as collateral');
    await LiquidityPool.connect(borrower1).depositCollateral(glintTokenAddress, ethers.parseEther('100'));

    // Set price feed for GlintToken using MockPriceFeed
    const mockPriceFeedAddress = addresses.MockPriceFeed;
    await LiquidityPool.connect(timelockSigner).setPriceFeed(glintTokenAddress, mockPriceFeedAddress);

    // --- Mock Lender Deposits ETH ---
    console.log('Mock: Lender1 deposits 10 ETH');
    await lender1.sendTransaction({
        to: await LiquidityPool.getAddress(),
        value: ethers.parseEther('10')
    });
    console.log('Mock: Lender2 deposits 5 ETH');
    await lender2.sendTransaction({
        to: await LiquidityPool.getAddress(),
        value: ethers.parseEther('5')
    });

    // --- Mock Lender Withdraws Interest Multiple Times ---
    for (let i = 1; i <= 3; i++) {
        // Simulate passage of time for interest accrual
        await network.provider.send('evm_increaseTime', [24 * 3600]);
        await network.provider.send('evm_mine');
        console.log(`Mock: Lender1 withdraws interest (iteration ${i})`);
        // In a real system, you would call a claim/withdraw interest function if available
        // Here, we just log the action as a placeholder
        // e.g., await LiquidityPool.connect(lender1).claimInterest();
    }

    // --- At the end, lender withdraws interest (no collateral withdrawal needed) ---
    // --- Mock Borrower Borrows and Repays ---
    const poolBalanceBefore = await provider.getBalance(await LiquidityPool.getAddress());
    const borrowerBalanceBefore = await provider.getBalance(borrower1.address);
    console.log('LiquidityPool ETH balance before borrow:', ethers.formatEther(poolBalanceBefore));
    console.log('Borrower1 ETH balance before borrow:', ethers.formatEther(borrowerBalanceBefore));
    console.log('Mock: Borrower1 borrows 0.5 ETH');
    await LiquidityPool.connect(borrower1).borrow(ethers.parseEther('0.5'));
    const poolBalanceAfter = await provider.getBalance(await LiquidityPool.getAddress());
    const borrowerBalanceAfter = await provider.getBalance(borrower1.address);
    console.log('LiquidityPool ETH balance after borrow:', ethers.formatEther(poolBalanceAfter));
    console.log('Borrower1 ETH balance after borrow:', ethers.formatEther(borrowerBalanceAfter));
    // Print borrower's debt and loan after borrowing
    const debtAfterBorrow = await LiquidityPool.userDebt(borrower1.address);
    const loanAfterBorrow = await LiquidityPool.loans(borrower1.address);
    console.log('Borrower1 debt after borrow:', debtAfterBorrow.toString());
    console.log('Borrower1 loan after borrow:', loanAfterBorrow);
    // Simulate some time passing
    await network.provider.send('evm_increaseTime', [3600]);
    await network.provider.send('evm_mine');
    console.log('Mock: Borrower1 repays 0.5 ETH');
    await LiquidityPool.connect(borrower1).repay({ value: ethers.parseEther('0.5') });
    // Print borrower's debt and loan after repay
    const debtAfterRepay = await LiquidityPool.userDebt(borrower1.address);
    const loanAfterRepay = await LiquidityPool.loans(borrower1.address);
    console.log('Borrower1 debt after repay:', debtAfterRepay.toString());
    console.log('Borrower1 loan after repay:', loanAfterRepay);

    // --- All setup is done, now create and vote on proposal ---
    // --- Mock Proposal Creation and Execution ---
    const newQuorum = 1; // 1%
    const calldata = ProtocolGovernor.interface.encodeFunctionData('setQuorumPercentage', [newQuorum]);
    const description = `Set quorum to ${newQuorum}% [mock proposal ${Date.now()}]`;
    const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));

    // Governor/Timelock debug
    const governorTimelock = await ProtocolGovernor.timelock();
    console.log('Governor timelock address:', governorTimelock);
    const TimelockController = await ethers.getContractAt('TimelockController', governorTimelock);
    const PROPOSER_ROLE = await TimelockController.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await TimelockController.EXECUTOR_ROLE();
    const governorIsProposer = await TimelockController.hasRole(PROPOSER_ROLE, await ProtocolGovernor.getAddress());
    const zeroIsExecutor = await TimelockController.hasRole(EXECUTOR_ROLE, ethers.ZeroAddress);
    console.log('Governor is proposer:', governorIsProposer);
    console.log('AddressZero is executor:', zeroIsExecutor);
    console.log('TimelockController address:', addresses.TimelockController);
    console.log('Propose args:', {
        targets: [await ProtocolGovernor.getAddress()],
        values: [0],
        calldatas: [calldata],
        description,
        descriptionHash
    });
    let proposalId;
    try {
        const proposeTx = await ProtocolGovernor.connect(deployer).propose(
            [await ProtocolGovernor.getAddress()],
            [0],
            [calldata],
            description
        );
        const proposeReceipt = await proposeTx.wait();
        await network.provider.send("evm_mine");
        proposalId = proposeReceipt.logs.find(log => {
            try {
                const parsed = ProtocolGovernor.interface.parseLog(log);
                return parsed.name === 'ProposalCreated';
            } catch {
                return false;
            }
        });
        if (proposalId) {
            proposalId = ProtocolGovernor.interface.parseLog(proposalId).args.proposalId;
        }
        console.log('Proposal created with ID:', proposalId);
    } catch (err) {
        console.error('Propose failed:', err);
        if (err.data) {
            console.error('Revert data:', err.data);
        }
        throw err;
    }
    let state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after propose:', state, getStateName(state)); // 0 = Pending

    // Advance time to activate proposal
    console.log('Advancing time to activate proposal...');
    const votingDelay = await ProtocolGovernor.votingDelay();
    const votingDelayNum = Number(votingDelay);
    console.log(`Contract votingDelay is ${votingDelayNum} seconds`);
    for (let i = 0; i <= votingDelayNum; i++) {
        await network.provider.send("evm_mine");
    }
    state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after activation:', state, getStateName(Number(state))); // 1 = Active
    if (Number(state) !== 1) {
        throw new Error(`Proposal is not Active. State is ${getStateName(Number(state))}`);
    }

    // --- Enhanced Voting Section with Debugging ---

    // 1. Check quorum requirements
    const quorum = await ProtocolGovernor.quorum(await provider.getBlockNumber());
    console.log(`Quorum required: ${quorum.toString()}`);

    // 2. Cast votes (1 = For)
    console.log("Casting votes...");
    for (const voter of VOTERS) {
        const tx = await ProtocolGovernor.connect(voter).castVote(proposalId, 1);
        await tx.wait(); // Wait for each vote to confirm
        console.log(`${voter.address} voted FOR`);
    }

    // Get current block number and deadline
    const currentBlock = await provider.getBlockNumber();
    const deadlineBlock = await ProtocolGovernor.proposalDeadline(proposalId);
    const blocksToAdvance = Number(deadlineBlock - BigInt(currentBlock) + 1n);

    for (let i = 0; i < blocksToAdvance; i++) {
        await network.provider.send("evm_mine");
    }

    // Now check state
    state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after voting ended:', state, getStateName(Number(state)));


    // 3. Verify votes
    const proposalVotes = await ProtocolGovernor.proposalVotes(proposalId);
    console.log(`Vote tally:
  - FOR: ${proposalVotes.forVotes.toString()}
  - AGAINST: ${proposalVotes.againstVotes.toString()}
  - ABSTAIN: ${proposalVotes.abstainVotes.toString()}`);

    // 4. Advance time and verify state
    const votingPeriod = await ProtocolGovernor.votingPeriod();
    await network.provider.send("evm_increaseTime", [Number(votingPeriod) + 5]);
    await network.provider.send("evm_mine");

    state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after voting ended:', state, getStateName(Number(state)));

    if (Number(state) !== 4) { // 4 = Succeeded
        console.error("Proposal failed! Debug info:");
        const proposalVotes = await ProtocolGovernor.proposalVotes(proposalId);
        console.error("- FOR votes:", proposalVotes.forVotes.toString());
        console.error("- AGAINST votes:", proposalVotes.againstVotes.toString());
        console.error("- ABSTAIN votes:", proposalVotes.abstainVotes.toString());
        console.error("- Current block number:", await provider.getBlockNumber());
        console.error("- Current block timestamp:", (await provider.getBlock('latest')).timestamp);
        console.error("- Snapshot block:", await ProtocolGovernor.proposalSnapshot(proposalId));
        console.error("- Deadline block:", await ProtocolGovernor.proposalDeadline(proposalId));
        throw new Error(`Proposal state is ${getStateName(Number(state))} (expected Succeeded)`);
    }
    console.log('Queueing proposal...');
    const timelockInterface = new ethers.Interface([
        "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)"
    ]);

    const queueTx = await ProtocolGovernor.queue(
        [await ProtocolGovernor.getAddress()],
        [0],
        [calldata],
        descriptionHash
    );
    const queueReceipt = await queueTx.wait();

    let operationIdFromEvent;
    for (const log of queueReceipt.logs) {
        if (log.address.toLowerCase() === (await TimelockController.getAddress()).toLowerCase()) {
            try {
                const parsedLog = timelockInterface.parseLog(log);
                if (parsedLog.name === "CallScheduled") {
                    operationIdFromEvent = parsedLog.args.id;
                    console.log(`CallScheduled event found! Operation ID: ${operationIdFromEvent}`);
                    break;
                }
            } catch (e) { /* ignore other events */ }
        }
    }

    if (!operationIdFromEvent) {
        throw new Error("Could not find CallScheduled event in queue transaction receipt");
    }

    let etaAfterQueue = await ProtocolGovernor.proposalEta(proposalId);
    console.log('Proposal ETA after queue:', etaAfterQueue.toString());
    state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after queue:', state, getStateName(state)); // 5 = Queued

    const scheduledTimestamp = await TimelockController.getTimestamp(operationIdFromEvent);
    console.log(`Scheduled timestamp for operation: ${scheduledTimestamp.toString()}`);

    const now = (await provider.getBlock('latest')).timestamp;
    const timeToAdvance = Number(scheduledTimestamp) - now;
    if (timeToAdvance > 0) {
        console.log(`Advancing time by ${timeToAdvance + 1} seconds for execution delay...`);
        await network.provider.send('evm_increaseTime', [timeToAdvance + 1]);
        await network.provider.send('evm_mine');
    }

    const isReady = await TimelockController.isOperationReady(operationIdFromEvent);
    if (!isReady) {
        const currentBlockTs = (await provider.getBlock('latest')).timestamp;
        const opTimestamp = await TimelockController.getTimestamp(operationIdFromEvent);
        console.error(`Operation not ready. Current time: ${currentBlockTs}, Scheduled time: ${opTimestamp}`);
        throw new Error('Timelock operation is not ready for execution!');
    }

    console.log('Executing proposal...');
    await ProtocolGovernor.execute(
        [await ProtocolGovernor.getAddress()],
        [0],
        [calldata],
        descriptionHash
    );
    state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after execute:', state, getStateName(state)); // 7 = Executed
    console.log('Mock: Proposal executed.');

    console.log('Mock transactions complete.');
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

// Execute main function if this script is run directly
if (require.main === module) {
    main()
        .then(() => {
            console.log("✅ Mock transactions completed successfully!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ Mock transactions failed:", error);
            process.exit(1);
        });
}

module.exports = { main };