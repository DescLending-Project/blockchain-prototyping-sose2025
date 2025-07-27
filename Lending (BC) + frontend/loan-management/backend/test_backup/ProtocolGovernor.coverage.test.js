const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProtocolGovernor - Coverage Boost", function () {
    let governor, votingToken, timelock;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy VotingToken with correct constructor
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address); // Pass DAO address
        await votingToken.waitForDeployment();

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        timelock = await TimelockController.deploy(
            60, // 1 minute delay
            [owner.address], // proposers
            [owner.address], // executors
            owner.address // admin
        );
        await timelock.waitForDeployment();

        // Deploy ProtocolGovernor with correct constructor
        const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
        governor = await ProtocolGovernor.deploy(
            votingToken.address,
            timelock.address
        );
        await governor.waitForDeployment();

        // Setup voting tokens for users (within 1-100 range)
        await votingToken.connect(owner).setLiquidityPool(owner.address);
        await votingToken.connect(owner).mint(user1.address, 50);
        await votingToken.connect(owner).mint(user2.address, 30);
        await votingToken.connect(owner).mint(user3.address, 20);
    });

    describe("Governance Functions", function () {
        it("should track user reputation", async function () {
            // Initial reputation should be token balance
            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
            expect(await votingToken.balanceOf(user2.address)).to.equal(30);
        });

        it("should handle proposal creation", async function () {
            const targets = [votingToken.address];
            const values = [0];
            const calldatas = [votingToken.interface.encodeFunctionData("setLiquidityPool", [user2.address])];
            const description = "Change liquidity pool";

            await expect(
                governor.connect(user1).propose(targets, values, calldatas, description)
            ).to.emit(governor, "ProposalCreated");
        });

        it("should handle voting process", async function () {
            const targets = [votingToken.address];
            const values = [0];
            const calldatas = [votingToken.interface.encodeFunctionData("setLiquidityPool", [user2.address])];
            const description = "Test proposal";

            await governor.connect(user1).propose(targets, values, calldatas, description);
            const proposalId = await governor.hashProposal(
                targets,
                values,
                calldatas,
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description))
            );

            // Wait for voting delay
            await ethers.provider.send("evm_mine");

            await expect(
                governor.connect(user1).castVote(proposalId, 1)
            ).to.emit(governor, "VoteCast");
        });

        it("should handle reputation penalties", async function () {
            await votingToken.connect(owner).setProtocolGovernor(governor.address);

            const initialBalance = await votingToken.balanceOf(user1.address);

            // Governor can penalize reputation
            await governor.connect(owner).penalizeReputation(user1.address, 10);

            const newBalance = await votingToken.balanceOf(user1.address);
            expect(newBalance).to.equal(initialBalance.sub(10));
        });
    });
});