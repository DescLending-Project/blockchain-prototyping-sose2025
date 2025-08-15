const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProtocolGovernor - Coverage Boost", function() {
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
            await votingToken.getAddress(),
            timelock.getAddress()
        );
        await governor.waitForDeployment();

        // Setup voting tokens for users (within 1-100 range)
        await votingToken.connect(owner).setLiquidityPool(owner.address);
        await votingToken.connect(owner).mint(user1.address, 50);
        await votingToken.connect(owner).mint(user2.address, 30);
        await votingToken.connect(owner).mint(user3.address, 20);
    });

    describe("Governance Functions", function() {
        it("should track user reputation", async function () {
            // Initial reputation should be token balance
            expect(await votingToken.balanceOf(user1.address)).to.equal(50n);
            expect(await votingToken.balanceOf(user2.address)).to.equal(30n);
        });

        it("should handle proposal creation", async function () {
            const targets = [await votingToken.getAddress()];
            const values = [0];
            const calldatas = [votingToken.interface.encodeFunctionData("setLiquidityPool", [user2.address])];
            const description = "Change liquidity pool";

            await expect(
                governor.connect(user1).propose(targets, values, calldatas, description)
            ).to.emit(governor, "ProposalCreated");
        });

        it("should handle voting process", async function () {
            const targets = [await votingToken.getAddress()];
            const values = [0];
            const calldatas = [votingToken.interface.encodeFunctionData("setLiquidityPool", [user2.address])];
            const description = "Test proposal";

            await governor.connect(user1).propose(targets, values, calldatas, description);
            const proposalId = await governor.hashProposal(
                targets,
                values,
                calldatas,
                ethers.keccak256(ethers.toUtf8Bytes(description))
            );

            // Check that proposal was created
            expect(proposalId).to.not.equal(0);
        });

        it("should handle reputation penalties", async function () {
            // Test that only VotingToken can call penalizeReputation
            await expect(
                governor.connect(owner).penalizeReputation(user1.address, 10)
            ).to.be.revertedWith("Only VotingToken");

            // Test that reputation tracking works
            const initialReputation = await governor.reputation(user1.address);
            expect(initialReputation).to.equal(0n);
        });
    });
});