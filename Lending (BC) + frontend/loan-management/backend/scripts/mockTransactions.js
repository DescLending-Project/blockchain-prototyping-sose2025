const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

async function main() {
    // EVM time sanity check and short periods for local testing
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
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
    const hardhatMnemonic = "test test test test test test test test test test test junk";
    const hdNode = ethers.utils.HDNode.fromMnemonic(hardhatMnemonic);

    roles.forEach(({ name, signer }, idx) => {
        // Always derive from mnemonic for local Hardhat accounts
        let pk;
        try {
            pk = hdNode.derivePath(`m/44'/60'/0'/0/${idx}`).privateKey;
        } catch {
            pk = 'N/A';
        }
        console.log(`${name}: ${signer.address} | Private Key: ${pk}`);
    });
    others.forEach((signer, idx) => {
        let pk;
        const accountIdx = idx + roles.length;
        try {
            pk = hdNode.derivePath(`m/44'/60'/0'/0/${accountIdx}`).privateKey;
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
    const accounts = await ethers.getSigners();
    const maxAccounts = Math.min(accounts.length, 10);
    const lenderIdx = 1;
    const borrowerIdx = 2;
    const tokenDistribution = [];
    for (let i = 0; i < maxAccounts; i++) {
        if (i === lenderIdx) {
            tokenDistribution.push(150); // Lender gets 150
        } else if (i === borrowerIdx) {
            tokenDistribution.push(90); // Borrower gets 90
        } else {
            // Random between 100 and 200, but not 150 or 90
            let rand;
            do {
                rand = Math.floor(Math.random() * 101) + 100;
            } while (rand === 150 || rand === 90);
            tokenDistribution.push(rand);
        }
        await VotingToken.mint(accounts[i].address, tokenDistribution[i], { gasLimit: 12000000 });
        console.log(`Minted ${tokenDistribution[i]} voting tokens to ${accounts[i].address}`);
    }
    // Mint extra tokens to first 3 accounts BEFORE proposal creation to ensure voting power is snapshotted
    const premintVoters = Math.min(3, maxAccounts);
    for (let j = 0; j < premintVoters; j++) {
        for (let k = 0; k < 10; k++) {
            await VotingToken.mint(accounts[j].address, 100, { gasLimit: 12000000 });
        }
        console.log(`Pre-minted 1000 tokens (in batches) to account ${j} (${accounts[j].address})`);
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
    await GlintToken.connect(deployer).transfer(borrower1.address, ethers.utils.parseEther('1000'));
    await GlintToken.connect(borrower1).approve(LiquidityPool.address, ethers.utils.parseEther('1000'));
    console.log('Mock: Borrower1 deposits 100 GlintToken as collateral');
    await LiquidityPool.connect(borrower1).depositCollateral(glintTokenAddress, ethers.utils.parseEther('100'));

    // Set price feed for GlintToken using MockPriceFeed
    const mockPriceFeedAddress = addresses.MockPriceFeed;
    await LiquidityPool.connect(timelockSigner).setPriceFeed(glintTokenAddress, mockPriceFeedAddress);

    // --- Mock Lender Deposits ETH ---
    console.log('Mock: Lender1 deposits 10 ETH');
    await lender1.sendTransaction({
        to: LiquidityPool.address,
        value: ethers.utils.parseEther('10')
    });
    console.log('Mock: Lender2 deposits 5 ETH');
    await lender2.sendTransaction({
        to: LiquidityPool.address,
        value: ethers.utils.parseEther('5')
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
    const poolBalanceBefore = await provider.getBalance(LiquidityPool.address);
    const borrowerBalanceBefore = await provider.getBalance(borrower1.address);
    console.log('LiquidityPool ETH balance before borrow:', ethers.utils.formatEther(poolBalanceBefore));
    console.log('Borrower1 ETH balance before borrow:', ethers.utils.formatEther(borrowerBalanceBefore));
    console.log('Mock: Borrower1 borrows 0.5 ETH');
    await LiquidityPool.connect(borrower1).borrow(ethers.utils.parseEther('0.5'));
    const poolBalanceAfter = await provider.getBalance(LiquidityPool.address);
    const borrowerBalanceAfter = await provider.getBalance(borrower1.address);
    console.log('LiquidityPool ETH balance after borrow:', ethers.utils.formatEther(poolBalanceAfter));
    console.log('Borrower1 ETH balance after borrow:', ethers.utils.formatEther(borrowerBalanceAfter));
    // Print borrower's debt and loan after borrowing
    const debtAfterBorrow = await LiquidityPool.userDebt(borrower1.address);
    const loanAfterBorrow = await LiquidityPool.loans(borrower1.address);
    console.log('Borrower1 debt after borrow:', debtAfterBorrow.toString());
    console.log('Borrower1 loan after borrow:', loanAfterBorrow);
    // Simulate some time passing
    await network.provider.send('evm_increaseTime', [3600]);
    await network.provider.send('evm_mine');
    console.log('Mock: Borrower1 repays 0.5 ETH');
    await LiquidityPool.connect(borrower1).repay({ value: ethers.utils.parseEther('0.5') });
    // Print borrower's debt and loan after repay
    const debtAfterRepay = await LiquidityPool.userDebt(borrower1.address);
    const loanAfterRepay = await LiquidityPool.loans(borrower1.address);
    console.log('Borrower1 debt after repay:', debtAfterRepay.toString());
    console.log('Borrower1 loan after repay:', loanAfterRepay);

    // --- All setup is done, now create and vote on proposal ---
    // --- Mock Proposal Creation and Execution ---
    const newQuorum = 5; // 5%
    const calldata = ProtocolGovernor.interface.encodeFunctionData('setQuorumPercentage', [newQuorum]);
    const description = `Set quorum to ${newQuorum}% [mock proposal ${Date.now()}]`;
    const descriptionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description));

    // Governor/Timelock debug
    const governorTimelock = await ProtocolGovernor.timelock();
    console.log('Governor timelock address:', governorTimelock);
    const TimelockController = await ethers.getContractAt('TimelockController', governorTimelock);
    const PROPOSER_ROLE = await TimelockController.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await TimelockController.EXECUTOR_ROLE();
    const governorIsProposer = await TimelockController.hasRole(PROPOSER_ROLE, ProtocolGovernor.address);
    const zeroIsExecutor = await TimelockController.hasRole(EXECUTOR_ROLE, ethers.constants.AddressZero);
    console.log('Governor is proposer:', governorIsProposer);
    console.log('AddressZero is executor:', zeroIsExecutor);
    console.log('TimelockController address:', addresses.TimelockController);
    console.log('Propose args:', {
        targets: [ProtocolGovernor.address],
        values: [0],
        calldatas: [calldata],
        description,
        descriptionHash
    });
    let proposalId;
    try {
        const proposeTx = await ProtocolGovernor.connect(deployer).propose(
            [ProtocolGovernor.address],
            [0],
            [calldata],
            description
        );
        const proposeReceipt = await proposeTx.wait();
        proposalId = proposeReceipt.events.find(e => e.event === 'ProposalCreated').args.proposalId;
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
    console.log(`Contract votingDelay is ${votingDelay.toNumber()} seconds`);
    await network.provider.send("evm_increaseTime", [votingDelay.toNumber() + 1]);
    await network.provider.send("evm_mine");

    state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after activation:', state, getStateName(state)); // 1 = Active
    if (state !== 1) {
        throw new Error(`Proposal is not Active. State is ${getStateName(state)}`);
    }

    for (let signer of [deployer, lender1, lender2, borrower1, borrower2]) {
        await ProtocolGovernor.connect(signer).castVote(proposalId, 1);
    }

    // Advance time for voting period
    console.log('Advancing time for voting period...');
    await network.provider.send("evm_increaseTime", [VOTING_PERIOD]);
    await network.provider.send("evm_mine");

    state = await ProtocolGovernor.state(proposalId);
    console.log('Proposal state after voting period:', state, getStateName(state)); // 4 = Succeeded
    if (state !== 4) throw new Error('Proposal not in Succeeded state before queue');

    console.log('Queueing proposal...');
    const timelockInterface = new ethers.utils.Interface([
        "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)"
    ]);

    const queueTx = await ProtocolGovernor.queue(
        [ProtocolGovernor.address],
        [0],
        [calldata],
        descriptionHash
    );
    const queueReceipt = await queueTx.wait();

    let operationIdFromEvent;
    for (const log of queueReceipt.logs) {
        if (log.address.toLowerCase() === TimelockController.address.toLowerCase()) {
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
    const timeToAdvance = scheduledTimestamp.toNumber() - now;
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
        [ProtocolGovernor.address],
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

main().catch((err) => {
    console.error('Mock transaction script failed:', err);
    process.exit(1);
});