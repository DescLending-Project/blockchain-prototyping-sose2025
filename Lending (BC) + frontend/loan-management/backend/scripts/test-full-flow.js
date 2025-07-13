// backend/scripts/test-full-flow.js
const { ethers, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    // 1. Deploy contracts
    const [deployer, user1, user2, dao] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    // Deploy GovToken
    const GovToken = await ethers.getContractFactory("GovToken");
    const govToken = await GovToken.deploy();
    await govToken.deployed();
    console.log("GovToken deployed at:", govToken.address);

    // Transfer tokens to users for voting power
    await govToken.transfer(user1.address, ethers.utils.parseEther("10000"));
    await govToken.transfer(user2.address, ethers.utils.parseEther("10000"));
    await govToken.connect(user1).delegate(user1.address);
    await govToken.connect(user2).delegate(user2.address);

    // Deploy TimelockController (DAO admin)
    const minDelay = 3600; // 1 hour
    const TimelockController = await ethers.getContractFactory("TimelockController");
    const timelock = await TimelockController.deploy(
        minDelay,
        [dao.address], // proposers
        [dao.address], // executors
        dao.address    // admin
    );
    await timelock.deployed();
    console.log("Timelock deployed at:", timelock.address);

    // Deploy ProtocolGovernor
    const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
    const governor = await ProtocolGovernor.deploy(govToken.address, timelock.address);
    await governor.deployed();
    console.log("Governor deployed at:", governor.address);

    // Deploy LendingManager (mock pool address for test)
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(deployer.address, timelock.address);
    await lendingManager.deployed();
    console.log("LendingManager deployed at:", lendingManager.address);

    // 2. Set up roles and permissions
    // Grant MINTER_ROLE to LendingManager, transfer admin to Timelock, renounce deployer
    await govToken.grantRole(await govToken.MINTER_ROLE(), lendingManager.address);
    await govToken.grantRole(await govToken.DEFAULT_ADMIN_ROLE(), timelock.address);
    await govToken.renounceRole(await govToken.DEFAULT_ADMIN_ROLE(), deployer.address);

    // Set govToken in LendingManager via DAO proposal
    const ifaceLM = new ethers.utils.Interface(["function setGovToken(address _govToken)"]);
    const setGovTokenCalldata = ifaceLM.encodeFunctionData("setGovToken", [govToken.address]);
    const setGovTokenProposalTx = await governor.connect(user1).propose(
        [lendingManager.address],
        [0],
        [setGovTokenCalldata],
        "Set GovToken in LendingManager"
    );
    const setGovTokenReceipt = await setGovTokenProposalTx.wait();
    const setGovTokenProposalId = setGovTokenReceipt.events.find(e => e.event === "ProposalCreated").args.proposalId;
    await governor.connect(user1).castVote(setGovTokenProposalId, 1);
    await governor.connect(user2).castVote(setGovTokenProposalId, 1);
    // Dynamically mine blocks to end voting period
    const votingPeriod1 = await governor.votingPeriod();
    for (let i = 0; i < votingPeriod1.toNumber() + 1; i++) {
        await ethers.provider.send("evm_mine");
    }
    await ethers.provider.send("evm_increaseTime", [3600 * 2]);
    await ethers.provider.send("evm_mine");
    await governor.connect(user1).queue(
        [lendingManager.address],
        [0],
        [setGovTokenCalldata],
        ethers.utils.id("Set GovToken in LendingManager")
    );
    await ethers.provider.send("evm_increaseTime", [3600 * 2]);
    await ethers.provider.send("evm_mine");
    await governor.connect(user1).execute(
        [lendingManager.address],
        [0],
        [setGovTokenCalldata],
        ethers.utils.id("Set GovToken in LendingManager")
    );
    console.log("GovToken set in LendingManager via DAO proposal");

    // 3. Simulate user actions: Lend, Borrow, Repay, Reward
    // User1 deposits (lends)
    await user1.sendTransaction({ to: lendingManager.address, value: ethers.utils.parseEther("1") });
    await lendingManager.connect(user1).depositFunds({ value: ethers.utils.parseEther("1") });
    // User1 should receive GovToken reward
    const user1Gov = await govToken.balanceOf(user1.address);
    console.log("User1 GovToken after lending:", user1Gov.toString());

    // User2 borrows and repays on time (simulate)
    // For simplicity, just mint reward directly for test
    await govToken.connect(lendingManager.signer).mint(user2.address, ethers.utils.parseEther("10"));
    const user2Gov = await govToken.balanceOf(user2.address);
    console.log("User2 GovToken after borrowing/repaying:", user2Gov.toString());

    // 4. DAO Proposal: User1 creates a proposal to mint tokens to themselves
    const iface = new ethers.utils.Interface(["function mint(address to, uint256 amount)"]);
    const calldata = iface.encodeFunctionData("mint", [user1.address, ethers.utils.parseEther("100")]);
    const tx = await governor.connect(user1).propose(
        [govToken.address],
        [0],
        [calldata],
        "Mint 100 GOV to user1"
    );
    const receipt = await tx.wait();
    const proposalId = receipt.events.find(e => e.event === "ProposalCreated").args.proposalId;
    console.log("Proposal created with ID:", proposalId.toString());

    // 5. Vote on proposal
    await governor.connect(user1).castVote(proposalId, 1); // For
    await governor.connect(user2).castVote(proposalId, 1); // For
    console.log("Votes cast for proposal");
    // Dynamically mine blocks to end voting period
    const votingPeriod2 = await governor.votingPeriod();
    for (let i = 0; i < votingPeriod2.toNumber() + 1; i++) {
        await ethers.provider.send("evm_mine");
    }

    // 6. Fast-forward time and queue/execute proposal
    await ethers.provider.send("evm_increaseTime", [3600 * 2]);
    await ethers.provider.send("evm_mine");
    await governor.connect(user1).queue(
        [govToken.address],
        [0],
        [calldata],
        ethers.utils.id("Mint 100 GOV to user1")
    );
    await ethers.provider.send("evm_increaseTime", [3600 * 2]);
    await ethers.provider.send("evm_mine");
    await governor.connect(user1).execute(
        [govToken.address],
        [0],
        [calldata],
        ethers.utils.id("Mint 100 GOV to user1")
    );
    const user1GovAfter = await govToken.balanceOf(user1.address);
    console.log("User1 GovToken after proposal execution:", user1GovAfter.toString());

    // 7. Write addresses to frontend
    const addresses = {
        GovToken: govToken.address,
        ProtocolGovernor: governor.address
    };
    const dest = path.join(__dirname, '../../frontend/src/addresses.json');
    fs.writeFileSync(dest, JSON.stringify(addresses, null, 2));
    console.log('Updated frontend addresses.json');

    // 8. Copy ABIs
    const srcDir = path.join(__dirname, '../../artifacts/backend/contracts');
    const destDir = path.join(__dirname, '../../frontend/src/abis');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    ['GovToken', 'ProtocolGovernor'].forEach(name => {
        const artifact = path.join(srcDir, `${name}.sol/${name}.json`);
        if (fs.existsSync(artifact)) {
            fs.copyFileSync(artifact, path.join(destDir, `${name}.json`));
            console.log(`Copied ${name} ABI`);
        }
    });

    console.log("Full protocol flow test completed successfully.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 