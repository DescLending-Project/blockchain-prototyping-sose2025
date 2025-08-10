const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

// Helper function to generate unique nullifiers for borrow operations
function generateNullifier(index) {
    return ethers.keccak256(ethers.toUtf8Bytes(`mock_nullifier_${Date.now()}_${index}`));
}

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

    // Verify contract deployment and ABI compatibility
    console.log('🔍 Verifying contract deployment...');
    const liquidityPoolCode = await ethers.provider.getCode(addresses.LiquidityPool);
    if (liquidityPoolCode === '0x') {
        throw new Error(`No contract deployed at LiquidityPool address ${addresses.LiquidityPool}. Please run: npx hardhat run scripts/deployAll2.js --network localhost`);
    }

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
    const NullifierRegistry = await ethers.getContractAt('NullifierRegistry', addresses.nullifierRegistry);

    // Verify borrow function signature
    console.log('🔍 Checking borrow function signature...');
    const borrowFunctions = LiquidityPool.interface.fragments.filter(f =>
        f.type === 'function' && f.name === 'borrow'
    );

    if (borrowFunctions.length === 0) {
        throw new Error('No borrow function found in LiquidityPool contract. Please recompile and redeploy contracts.');
    }

    const borrowFunc = borrowFunctions[0];
    if (borrowFunc.inputs.length !== 2) {
        throw new Error(`Borrow function has ${borrowFunc.inputs.length} parameters, expected 2 (amount, nullifier). Please redeploy contracts with updated UserHistory implementation.`);
    }

    console.log(`✅ Borrow function signature verified: ${borrowFunc.format()}`);

    // --- Setup NullifierRegistry accounts ---
    console.log('🔧 Setting up NullifierRegistry accounts...');

    // Select accounts for nullifier generation (required before borrowing)
    const borrowers = [borrower1, borrower2];
    const liquidationBorrower = others[0]; // Get the liquidation borrower
    const allBorrowers = [...borrowers, liquidationBorrower, deployer]; // Include deployer for admin operations

    for (const borrower of allBorrowers) {
        try {
            console.log(`Setting up nullifier account for ${borrower.address}`);
            await NullifierRegistry.connect(borrower).selectAccounts([borrower.address]);
        } catch (error) {
            console.log(`Warning: Failed to setup nullifier for ${borrower.address}: ${error.message}`);
        }
    }

    console.log('✅ NullifierRegistry accounts setup complete');

    // --- Setup Prerequisites for Borrowing ---
    console.log('🔧 Setting up borrowing prerequisites...');

    // Ensure pool has sufficient funds
    const poolBalance = await LiquidityPool.getBalance();
    console.log(`Current pool balance: ${ethers.formatEther(poolBalance)} ETH`);

    if (poolBalance < ethers.parseEther('5')) {
        console.log('Adding funds to pool...');
        await deployer.sendTransaction({
            to: await LiquidityPool.getAddress(),
            value: ethers.parseEther('10')
        });
        const newBalance = await LiquidityPool.getBalance();
        console.log(`New pool balance: ${ethers.formatEther(newBalance)} ETH`);
    }

    // Get timelock signer for admin operations
    const timelockSigner = await ethers.getImpersonatedSigner(addresses.TimelockController);

    // Fund the timelock with ETH for gas fees
    await deployer.sendTransaction({
        to: addresses.TimelockController,
        value: ethers.parseEther('1')
    });
    console.log('✅ Funded timelock with ETH for gas fees');

    // Setup credit scores for borrowers (using timelock)
    const borrowersToSetup = [borrower1, borrower2, liquidationBorrower];
    for (const borrower of borrowersToSetup) {
        const currentScore = await LiquidityPool.creditScore(borrower.address);
        if (currentScore === 0n) {
            console.log(`Setting credit score for ${borrower.address}`);
            await LiquidityPool.connect(timelockSigner).setCreditScore(borrower.address, 85);
        }
    }

    // Ensure GLINT token is set up as collateral (using timelock)
    const glintTokenAddress = addresses.GlintToken;
    const isAllowed = await LiquidityPool.isAllowedCollateral(glintTokenAddress);
    if (!isAllowed) {
        console.log('Setting up GLINT as allowed collateral...');
        await LiquidityPool.connect(timelockSigner).setAllowedCollateral(glintTokenAddress, true);
    }

    console.log('✅ Borrowing prerequisites setup complete');

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

    // Fund the timelock with ETH for gas fees
    await deployer.sendTransaction({
        to: addresses.TimelockController,
        value: ethers.parseEther('1')
    });
    console.log('✅ Funded timelock with ETH for gas fees');

    // --- Owner/Admin Activities (Deployer) ---
    console.log('Mock: Owner/Admin activities');

    // Load GlintToken contract
    const GlintToken = await ethers.getContractAt('GlintToken', glintTokenAddress);

    // Note: Using timelock for admin operations (as required by contract)
    // In production, these would be done through governance proposals

    // Set credit scores for users (already done in prerequisites, but updating for demo)
    console.log('Mock: Admin sets credit score for lender1');
    await LiquidityPool.connect(timelockSigner).setCreditScore(lender1.address, 85);

    console.log('Mock: Admin sets credit score for lender2');
    await LiquidityPool.connect(timelockSigner).setCreditScore(lender2.address, 90);

    console.log('Mock: Admin updates credit score for borrower1');
    await LiquidityPool.connect(timelockSigner).setCreditScore(borrower1.address, 80);

    console.log('Mock: Admin updates credit score for borrower2');
    await LiquidityPool.connect(timelockSigner).setCreditScore(borrower2.address, 75);

    // Ensure GLINT is whitelisted as collateral (already done in prerequisites)
    console.log('Mock: Admin confirms GlintToken as collateral');
    const isStillAllowed = await LiquidityPool.isAllowedCollateral(glintTokenAddress);
    if (!isStillAllowed) {
        await LiquidityPool.connect(timelockSigner).setAllowedCollateral(glintTokenAddress, true);
    }

    // Set price feed for GlintToken using MockPriceFeed
    const mockPriceFeedAddress = addresses.MockPriceFeed;
    console.log('Mock: Admin sets price feed for GlintToken');
    const currentPriceFeed = await LiquidityPool.priceFeed(glintTokenAddress);
    if (currentPriceFeed === ethers.ZeroAddress) {
        await LiquidityPool.connect(timelockSigner).setPriceFeed(glintTokenAddress, mockPriceFeedAddress);
    }

    // Admin transfers tokens to borrowers for collateral
    console.log('Mock: Admin transfers GlintTokens to borrowers');
    await GlintToken.connect(deployer).transfer(borrower1.address, ethers.parseEther('1000'));
    await GlintToken.connect(deployer).transfer(borrower2.address, ethers.parseEther('800'));

    // --- Mock Lender Activities ---
    console.log('Mock: Lender1 deposits 10 ETH via LendingManager');
    try {
        await LendingManager.connect(lender1).depositFunds({ value: ethers.parseEther('10') });
    } catch (error) {
        console.log('Mock: LendingManager deposit failed, trying direct pool deposit');
        // Fallback to direct pool deposit if LendingManager has issues
        await lender1.sendTransaction({
            to: await LiquidityPool.getAddress(),
            value: ethers.parseEther('10')
        });
    }

    console.log('Mock: Lender2 deposits 5 ETH via LendingManager');
    try {
        await LendingManager.connect(lender2).depositFunds({ value: ethers.parseEther('5') });
    } catch (error) {
        console.log('Mock: LendingManager deposit failed, trying direct pool deposit');
        await lender2.sendTransaction({
            to: await LiquidityPool.getAddress(),
            value: ethers.parseEther('5')
        });
    }

    // Simulate time passage for interest accrual
    await network.provider.send('evm_increaseTime', [7 * 24 * 3600]); // 7 days
    await network.provider.send('evm_mine');

    // --- Mock Lender Withdrawals ---
    console.log('Mock: Lender1 requests withdrawal of 2 ETH');
    try {
        await LendingManager.connect(lender1).requestWithdrawal(ethers.parseEther('2'));

        // Wait for cooldown period
        await network.provider.send('evm_increaseTime', [24 * 3600 + 1]); // 1 day + 1 second
        await network.provider.send('evm_mine');

        console.log('Mock: Lender1 completes withdrawal');
        await LendingManager.connect(lender1).completeWithdrawal();
    } catch (error) {
        console.log('Mock: Withdrawal failed, skipping lender withdrawal activities');
    }

    // More time passage
    await network.provider.send('evm_increaseTime', [3 * 24 * 3600]); // 3 days
    await network.provider.send('evm_mine');

    // Additional deposit from lender1
    console.log('Mock: Lender1 makes additional deposit of 3 ETH');
    try {
        await LendingManager.connect(lender1).depositFunds({ value: ethers.parseEther('3') });
    } catch (error) {
        console.log('Mock: Additional deposit failed, using direct transfer');
        await lender1.sendTransaction({
            to: await LiquidityPool.getAddress(),
            value: ethers.parseEther('3')
        });
    }

    // --- Mock Borrower Activities ---

    // Borrower1 activities
    console.log('Mock: Borrower1 deposits 500 GlintToken as collateral');
    const collateralAmount1 = ethers.parseEther('500');
    await GlintToken.connect(borrower1).approve(await LiquidityPool.getAddress(), ethers.parseEther('1000'));
    await LiquidityPool.connect(borrower1).depositCollateral(glintTokenAddress, collateralAmount1);
    console.log(`  Deposited ${ethers.formatEther(collateralAmount1)} GLINT tokens`);

    console.log('Mock: Borrower1 borrows 1 ETH');
    const borrowAmount1 = ethers.parseEther('1');
    const nullifier1 = generateNullifier(1);

    // Debug information before borrow
    console.log(`  Borrow amount: ${ethers.formatEther(borrowAmount1)} ETH`);
    console.log(`  Nullifier: ${nullifier1}`);

    try {
        // Check prerequisites
        const existingDebt = await LiquidityPool.userDebt(borrower1.address);
        const creditScore = await LiquidityPool.creditScore(borrower1.address);
        const collateralValue = await LiquidityPool.getTotalCollateralValue(borrower1.address);
        const borrowTerms = await LiquidityPool.getBorrowTerms(borrower1.address);

        console.log(`  Existing debt: ${ethers.formatEther(existingDebt)} ETH`);
        console.log(`  Credit score: ${creditScore}`);
        console.log(`  Collateral value: ${ethers.formatEther(collateralValue)} ETH`);
        console.log(`  Max loan amount: ${ethers.formatEther(borrowTerms[2])} ETH`);
        console.log(`  Required collateral ratio: ${borrowTerms[0]}%`);

        await LiquidityPool.connect(borrower1).borrow(borrowAmount1, nullifier1);
        console.log('  ✅ Borrow successful');

    } catch (error) {
        console.log(`  ❌ Borrow failed: ${error.message}`);

        // Try static call for better error info
        try {
            await LiquidityPool.connect(borrower1).borrow.staticCall(borrowAmount1, nullifier1);
        } catch (staticError) {
            console.log(`  Static call error: ${staticError.message}`);
        }
        throw error;
    }

    // Simulate some time passing
    await network.provider.send('evm_increaseTime', [5 * 24 * 3600]); // 5 days
    await network.provider.send('evm_mine');

    console.log('Mock: Borrower1 repays 0.6 ETH (partial repayment)');
    await LiquidityPool.connect(borrower1).repay({ value: ethers.parseEther('0.6') });

    // Check UserHistory after first repayment
    const borrower1HistoryAfterPartialRepay = await LiquidityPool.getUserHistory(borrower1.address);
    console.log(`📊 Borrower1 History: First interaction: ${borrower1HistoryAfterPartialRepay.firstInteractionTimestamp}, Payments: ${borrower1HistoryAfterPartialRepay.succesfullPayments}, Liquidations: ${borrower1HistoryAfterPartialRepay.liquidations}`);

    // More time passing
    await network.provider.send('evm_increaseTime', [2 * 24 * 3600]); // 2 days
    await network.provider.send('evm_mine');

    console.log('Mock: Borrower1 repays remaining debt');
    const remainingDebt = await LiquidityPool.userDebt(borrower1.address);
    if (remainingDebt > 0) {
        await LiquidityPool.connect(borrower1).repay({ value: remainingDebt });
    }

    // Check final UserHistory for Borrower1
    const borrower1FinalHistory = await LiquidityPool.getUserHistory(borrower1.address);
    console.log(`📊 Borrower1 Final History: First interaction: ${borrower1FinalHistory.firstInteractionTimestamp}, Payments: ${borrower1FinalHistory.succesfullPayments}, Liquidations: ${borrower1FinalHistory.liquidations}`);

    // Borrower2 activities
    console.log('Mock: Borrower2 deposits 200 GlintToken as collateral');
    const collateralAmount2 = ethers.parseEther('200');
    await GlintToken.connect(borrower2).approve(await LiquidityPool.getAddress(), ethers.parseEther('1000'));
    await LiquidityPool.connect(borrower2).depositCollateral(glintTokenAddress, collateralAmount2);
    console.log(`  Deposited ${ethers.formatEther(collateralAmount2)} GLINT tokens`);

    console.log('Mock: Borrower2 borrows 0.5 ETH');
    const borrowAmount2 = ethers.parseEther('0.5');
    const nullifier2 = generateNullifier(2);
    await LiquidityPool.connect(borrower2).borrow(borrowAmount2, nullifier2);

    // Time passing
    await network.provider.send('evm_increaseTime', [3 * 24 * 3600]); // 3 days
    await network.provider.send('evm_mine');

    console.log('Mock: Borrower2 repays loan');
    const borrower2Debt = await LiquidityPool.userDebt(borrower2.address);
    if (borrower2Debt > 0) {
        await LiquidityPool.connect(borrower2).repay({ value: borrower2Debt });
    }

    // Check UserHistory for Borrower2
    const borrower2History = await LiquidityPool.getUserHistory(borrower2.address);
    console.log(`📊 Borrower2 History: First interaction: ${borrower2History.firstInteractionTimestamp}, Payments: ${borrower2History.succesfullPayments}, Liquidations: ${borrower2History.liquidations}`);

    // --- Mock Liquidation Scenario ---
    // Use the liquidation borrower already defined and setup above

    console.log('Mock: Setting up liquidation scenario');
    // Set a lower credit score for liquidation borrower
    await LiquidityPool.connect(timelockSigner).setCreditScore(liquidationBorrower.address, 60);

    // Transfer some GlintTokens to liquidation borrower
    await GlintToken.connect(deployer).transfer(liquidationBorrower.address, ethers.parseEther('100'));

    // Deposit minimal collateral
    console.log('Mock: Liquidation borrower deposits minimal collateral');
    const collateralAmount3 = ethers.parseEther('60');
    await GlintToken.connect(liquidationBorrower).approve(await LiquidityPool.getAddress(), ethers.parseEther('100'));
    await LiquidityPool.connect(liquidationBorrower).depositCollateral(glintTokenAddress, collateralAmount3);
    console.log(`  Deposited ${ethers.formatEther(collateralAmount3)} GLINT tokens`);

    // Borrow close to the limit
    console.log('Mock: Liquidation borrower borrows near limit');
    const borrowAmount3 = ethers.parseEther('0.3');
    const nullifier3 = generateNullifier(3);
    await LiquidityPool.connect(liquidationBorrower).borrow(borrowAmount3, nullifier3);

    // Simulate price drop or time passage that makes position unhealthy
    await network.provider.send('evm_increaseTime', [10 * 24 * 3600]); // 10 days
    await network.provider.send('evm_mine');

    // Start liquidation process
    console.log('Mock: Starting liquidation for unhealthy position');
    try {
        await LiquidityPool.connect(deployer).startLiquidation(liquidationBorrower.address);

        // Simulate liquidation execution (normally done by LendingManager)
        console.log('Mock: Executing liquidation (simulating LendingManager call)');
        const liquidationBorrowerDebt = await LiquidityPool.userDebt(liquidationBorrower.address);
        if (liquidationBorrowerDebt > 0) {
            // This would normally be called by LendingManager after liquidation
            await LiquidityPool.clearDebt(liquidationBorrower.address, liquidationBorrowerDebt);

            // Check UserHistory after liquidation
            const liquidationBorrowerHistory = await LiquidityPool.getUserHistory(liquidationBorrower.address);
            console.log(`📊 Liquidated Borrower History: First interaction: ${liquidationBorrowerHistory.firstInteractionTimestamp}, Payments: ${liquidationBorrowerHistory.succesfullPayments}, Liquidations: ${liquidationBorrowerHistory.liquidations}`);
        }
    } catch (error) {
        console.log('Mock: Liquidation failed (position might still be healthy):', error.message);
    }

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

    // === UserHistory Summary ===
    console.log('\n' + '='.repeat(60));
    console.log('📊 USER HISTORY SUMMARY');
    console.log('='.repeat(60));

    // Use existing signers (already declared at the beginning of main function)

    // Get all user histories
    const users = [
        { name: 'Borrower1', address: borrower1.address },
        { name: 'Borrower2', address: borrower2.address },
        { name: 'Liquidated Borrower', address: liquidationBorrower.address }
    ];

    for (const user of users) {
        try {
            const history = await LiquidityPool.getUserHistory(user.address);
            const firstInteraction = history.firstInteractionTimestamp > 0
                ? new Date(Number(history.firstInteractionTimestamp) * 1000).toLocaleString()
                : 'Never';

            console.log(`\n👤 ${user.name} (${user.address}):`);
            console.log(`   First Interaction: ${firstInteraction}`);
            console.log(`   Successful Payments: ${history.succesfullPayments}`);
            console.log(`   Liquidations: ${history.liquidations}`);

            // Calculate simple performance score
            const totalInteractions = Number(history.succesfullPayments) + Number(history.liquidations);
            if (totalInteractions > 0) {
                const score = (Number(history.succesfullPayments) / totalInteractions * 100).toFixed(1);
                console.log(`   Performance Score: ${score}% (${history.succesfullPayments}/${totalInteractions})`);
            }
        } catch (error) {
            console.log(`\n👤 ${user.name}: Error fetching history - ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
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