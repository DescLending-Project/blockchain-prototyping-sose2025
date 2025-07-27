const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProtocolGovernor - Coverage Boost", function () {
    let votingToken, timelock, governor, lendingManager;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy();
        await votingToken.deployed();

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        timelock = await TimelockController.deploy(
            60, // 1 minute delay
            [owner.address], // proposers
            [owner.address], // executors
            owner.address // admin
        );
        await timelock.deployed();

        // Deploy ProtocolGovernor
        const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
        governor = await ProtocolGovernor.deploy(
            votingToken.address,
            timelock.address,
            1, // voting delay
            60, // voting period
            ethers.utils.parseEther("100"), // proposal threshold
            4 // quorum percentage
        );
        await governor.deployed();

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            owner.address, // liquidityPool
            owner.address, // interestRateModel
            timelock.address, // timelock
            86400 // withdrawal cooldown (1 day)
        );
        await lendingManager.deployed();

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

        await timelock.grantRole(PROPOSER_ROLE, governor.address);
        await timelock.grantRole(EXECUTOR_ROLE, ethers.constants.AddressZero);

        // Mint tokens for testing
        await votingToken.mint(owner.address, ethers.utils.parseEther("1000"));
        await votingToken.mint(user1.address, ethers.utils.parseEther("500"));
        await votingToken.mint(user2.address, ethers.utils.parseEther("300"));
    });

    describe("User Reputation Tracking", function () {
        it("should track user reputation", async function () {
            // Test reputation tracking functionality
            const initialReputation = await lendingManager.getUserReputation(user1.address);
            expect(initialReputation).to.equal(0);

            // Simulate deposit to increase reputation
            await lendingManager.connect(user1).deposit({ value: ethers.utils.parseEther("1") });

            const updatedReputation = await lendingManager.getUserReputation(user1.address);
            expect(updatedReputation).to.be.gt(initialReputation);
        });

        it("should handle reputation decay over time", async function () {
            // Deposit to build reputation
            await lendingManager.connect(user1).deposit({ value: ethers.utils.parseEther("1") });

            const initialReputation = await lendingManager.getUserReputation(user1.address);

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine");

            const decayedReputation = await lendingManager.getUserReputation(user1.address);
            expect(decayedReputation).to.be.lte(initialReputation);
        });
    });

    describe("Advanced Lending Features", function () {
        it("should handle complex interest calculations", async function () {
            // Deposit funds
            await lendingManager.connect(user1).deposit({ value: ethers.utils.parseEther("10") });

            // Check initial balance
            const initialBalance = await lendingManager.getBalance(user1.address);
            expect(initialBalance).to.equal(ethers.utils.parseEther("10"));

            // Fast forward time to accrue interest
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine");

            // Accrue interest
            await lendingManager.accrueInterest();

            const balanceWithInterest = await lendingManager.getBalance(user1.address);
            expect(balanceWithInterest).to.be.gt(initialBalance);
        });

        it("should handle withdrawal requests properly", async function () {
            // Deposit funds first
            await lendingManager.connect(user1).deposit({ value: ethers.utils.parseEther("5") });

            // Request withdrawal
            await lendingManager.connect(user1).requestWithdrawal(ethers.utils.parseEther("2"));

            // Check withdrawal request
            const canComplete = await lendingManager.canCompleteWithdrawal(user1.address);
            expect(canComplete).to.be.false; // Should be false before cooldown

            // Fast forward past cooldown
            await ethers.provider.send("evm_increaseTime", [86400 + 1]); // 1 day + 1 second
            await ethers.provider.send("evm_mine");

            const canCompleteAfter = await lendingManager.canCompleteWithdrawal(user1.address);
            expect(canCompleteAfter).to.be.true;
        });
    });

    describe("Emergency Functions", function () {
        it("should handle emergency pause", async function () {
            await lendingManager.pause();

            const isPaused = await lendingManager.paused();
            expect(isPaused).to.be.true;

            // Should revert deposits when paused
            await expect(
                lendingManager.connect(user1).deposit({ value: ethers.utils.parseEther("1") })
            ).to.be.revertedWith("Pausable: paused");
        });

        it("should handle emergency unpause", async function () {
            await lendingManager.pause();
            await lendingManager.unpause();

            const isPaused = await lendingManager.paused();
            expect(isPaused).to.be.false;

            // Should allow deposits when unpaused
            await expect(
                lendingManager.connect(user1).deposit({ value: ethers.utils.parseEther("1") })
            ).to.not.be.reverted;
        });
    });
});
