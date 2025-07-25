const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProtocolGovernor - Coverage Boost", function () {
    let governor, votingToken, timelock;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address);
        await votingToken.deployed();

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        timelock = await TimelockController.deploy(
            3600, // 1 hour delay
            [owner.address], // proposers
            [ethers.constants.AddressZero], // executors
            owner.address // admin
        );
        await timelock.deployed();

        // Deploy ProtocolGovernor
        const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
        governor = await ProtocolGovernor.deploy(votingToken.address, timelock.address);
        await governor.deployed();

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        await timelock.grantRole(PROPOSER_ROLE, governor.address);
        await votingToken.setDAO(governor.address);
    });

    describe("Reputation System", function () {
        it("should track user reputation", async function () {
            expect(await governor.getReputation(user1.address)).to.equal(0);
        });

        it("should penalize reputation", async function () {
            await governor.penalizeReputation(user1.address, 10);
            expect(await governor.getReputation(user1.address)).to.equal(-10);
        });

        it("should affect voting power based on reputation", async function () {
            await votingToken.mint(user1.address, 100);

            // Test normal voting power
            const normalVotes = await governor._getVotes(user1.address, 0, "0x");

            // Penalize reputation
            await governor.penalizeReputation(user1.address, 15);

            // Test reduced voting power
            const reducedVotes = await governor._getVotes(user1.address, 0, "0x");
            expect(reducedVotes).to.be.lt(normalVotes);
        });
    });

    describe("Token Granting", function () {
        beforeEach(async function () {
            // Setup mock price feed
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const priceFeed = await MockPriceFeed.deploy(ethers.utils.parseUnits("1", 8), 8);
            await priceFeed.deployed();

            await governor.setPriceFeed(user1.address, priceFeed.address);
            await governor.setAllowedContract(owner.address, true);
        });

        it("should grant tokens for lending", async function () {
            const initialBalance = await votingToken.balanceOf(user1.address);

            await governor.grantTokens(
                user1.address,
                user1.address, // mock asset
                ethers.utils.parseEther("100"),
                0 // LEND
            );

            const finalBalance = await votingToken.balanceOf(user1.address);
            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("should grant tokens for borrowing", async function () {
            await governor.grantTokens(
                user1.address,
                user1.address,
                ethers.utils.parseEther("100"),
                1 // BORROW
            );

            expect(await votingToken.balanceOf(user1.address)).to.be.gt(0);
        });

        it("should grant tokens for repaying", async function () {
            await governor.grantTokens(
                user1.address,
                user1.address,
                ethers.utils.parseEther("100"),
                2 // REPAY
            );

            expect(await votingToken.balanceOf(user1.address)).to.be.gt(0);
        });
    });

    describe("Contract Management", function () {
        it("should set allowed contracts", async function () {
            await governor.setAllowedContract(user1.address, true);
            expect(await governor.allowedContracts(user1.address)).to.be.true;
        });

        it("should set price feeds", async function () {
            await governor.setPriceFeed(user1.address, user2.address);
            expect(await governor.priceFeeds(user1.address)).to.equal(user2.address);
        });

        it("should set multipliers", async function () {
            await governor.setMultipliers(
                ethers.utils.parseEther("1.2"),
                ethers.utils.parseEther("0.8"),
                ethers.utils.parseEther("1.1")
            );

            expect(await governor.lendMultiplier()).to.equal(ethers.utils.parseEther("1.2"));
            expect(await governor.borrowMultiplier()).to.equal(ethers.utils.parseEther("0.8"));
            expect(await governor.repayMultiplier()).to.equal(ethers.utils.parseEther("1.1"));
        });
    });

    describe("Quorum Management", function () {
        it("should set quorum percentage", async function () {
            await governor.setQuorumPercentage(3000);
            expect(await governor.quorumPercentage()).to.equal(3000);
        });

        it("should reject invalid quorum values", async function () {
            await expect(governor.setQuorumPercentage(0)).to.be.revertedWith("Quorum must be > 0");
            await expect(governor.setQuorumPercentage(10001)).to.be.revertedWith("Quorum must be <= 10000");
        });
    });
});
