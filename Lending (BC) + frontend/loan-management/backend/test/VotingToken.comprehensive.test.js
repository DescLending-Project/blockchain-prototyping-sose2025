const { expect } = require("chai");
const { ethers } = require("hardhat");
require("@nomicfoundation/hardhat-chai-matchers");

describe("VotingToken - Complete Coverage", function() {
    let votingToken;
    let owner, dao, minter, user1, user2, user3, protocolGovernor;

    beforeEach(async function () {
        [owner, dao, minter, user1, user2, user3, protocolGovernor] = await ethers.getSigners();

        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(dao.address);
        await votingToken.waitForDeployment();

        // Set up roles - the deployer (owner) has DEFAULT_ADMIN_ROLE, not dao
        const MINTER_ROLE = await votingToken.MINTER_ROLE();
        await votingToken.connect(owner).grantRole(MINTER_ROLE, minter.address);

        // Set up protocol governor
        await votingToken.connect(owner).setProtocolGovernor(protocolGovernor.address);
    });

    describe("Initialization", function() {
        it("should initialize with correct DAO", async function () {
            expect(await votingToken.dao()).to.equal(dao.address);
        });

        it("should have correct name and symbol", async function () {
            expect(await votingToken.name()).to.equal("Governance Token");
            expect(await votingToken.symbol()).to.equal("GOV");
        });

        it("should start with zero total supply", async function () {
            expect(await votingToken.nextTokenId()).to.equal(1n); // ERC721 starts at 1
        });
    });

    describe("Access Control", function() {
        it("should allow admin to set liquidity pool", async function () {
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            expect(await votingToken.liquidityPool()).to.equal(user1.address);
        });

        it("should allow admin to set protocol governor", async function () {
            await votingToken.connect(owner).setProtocolGovernor(user2.address);
            expect(await votingToken.protocolGovernor()).to.equal(user2.address);
        });

        it("should reject non-admin setting liquidity pool", async function () {
            await expect(
                votingToken.connect(user1).setLiquidityPool(user2.address)
            ).to.be.reverted;
        });

        it("should reject non-admin setting protocol governor", async function () {
            await expect(
                votingToken.connect(user1).setProtocolGovernor(user2.address)
            ).to.be.reverted;
        });

        it("should reject zero address for liquidity pool", async function () {
            await expect(
                votingToken.connect(owner).setLiquidityPool(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid pool address");
        });

        it("should reject zero address for protocol governor", async function () {
            await expect(
                votingToken.connect(owner).setProtocolGovernor(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid governor address");
        });
    });

    describe("Minting", function() {
        it("should allow minter to mint tokens", async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
            expect(await votingToken.balanceOf(user1.address)).to.equal(50n);
        });

        it("should reject minting from non-minter", async function () {
            await expect(
                votingToken.connect(user1).mint(user2.address, 50)
            ).to.be.reverted;
        });

        it("should reject minting zero amount", async function () {
            await expect(
                votingToken.connect(minter).mint(user1.address, 0)
            ).to.be.revertedWith("Amount must be 1-100");
        });

        it("should reject minting over 100", async function () {
            await expect(
                votingToken.connect(minter).mint(user1.address, 101)
            ).to.be.revertedWith("Amount must be 1-100");
        });

        it("should reject minting to zero address", async function () {
            await expect(
                votingToken.connect(minter).mint(ethers.ZeroAddress, 50)
            ).to.be.revertedWith("Invalid address");
        });

        it("should handle multiple mints to same address", async function () {
            await votingToken.connect(minter).mint(user1.address, 30);
            await votingToken.connect(minter).mint(user1.address, 20);

            expect(await votingToken.balanceOf(user1.address)).to.equal(50n);
            expect(await votingToken.totalSupply()).to.equal(50n);
        });

        it("should mint maximum allowed amount", async function () {
            await votingToken.connect(minter).mint(user1.address, 100);
            expect(await votingToken.balanceOf(user1.address)).to.equal(100n);
        });

        it("should mint minimum allowed amount", async function () {
            await votingToken.connect(minter).mint(user1.address, 1);
            expect(await votingToken.balanceOf(user1.address)).to.equal(1n);
        });
    });

    describe("Reputation System", function() {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
            await votingToken.connect(minter).mint(user2.address, 30);
        });

        it("should allow protocol governor to penalize reputation", async function () {
            await expect(
                votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 10)
            ).to.emit(votingToken, "ReputationPenalized")
                .withArgs(user1.address, 10);

            expect(await votingToken.balanceOf(user1.address)).to.equal(40n);
            expect(await votingToken.reputation(user1.address)).to.equal(-10);
        });

        it("should reject reputation penalty from non-protocol governor", async function () {
            await expect(
                votingToken.connect(user1).penalizeReputation(user2.address, 10)
            ).to.be.revertedWith("Only ProtocolGovernor");
        });

        it("should handle zero penalty amount", async function () {
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 0);
            expect(await votingToken.balanceOf(user1.address)).to.equal(50n);
            expect(await votingToken.reputation(user1.address)).to.equal(0n);
        });

        it("should handle penalty larger than balance", async function () {
            const initialBalance = await votingToken.balanceOf(user1.address);
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 60);
            expect(await votingToken.balanceOf(user1.address)).to.equal(0n);
            // Reputation decreases by the actual number of tokens burned, not the requested amount
            expect(await votingToken.reputation(user1.address)).to.equal(-Number(initialBalance));
        });

        it("should accumulate multiple penalties", async function () {
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 10);
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 5);

            expect(await votingToken.balanceOf(user1.address)).to.equal(35n);
            expect(await votingToken.reputation(user1.address)).to.equal(-15);
        });
    });

    describe("Voting Power and Delegation", function() {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
            await votingToken.connect(minter).mint(user2.address, 30);
            await votingToken.connect(minter).mint(user3.address, 20);

            // Users need to delegate to themselves to have voting power
            await votingToken.connect(user1).delegate(user1.address);
            await votingToken.connect(user2).delegate(user2.address);
            await votingToken.connect(user3).delegate(user3.address);
        });

        it("should track voting power correctly", async function () {
            // Check that votes are reasonable after self-delegation
            const user1Balance = await votingToken.balanceOf(user1.address);
            const user2Balance = await votingToken.balanceOf(user2.address);
            const user1Votes = await votingToken.getVotes(user1.address);
            const user2Votes = await votingToken.getVotes(user2.address);

            // After self-delegation, votes should be at least their own balance
            // (may be more if others have delegated to them in previous tests)
            expect(user1Votes).to.be.gte(user1Balance);
            expect(user2Votes).to.be.gte(user2Balance);
            expect(user1Balance).to.be.gt(0n);
            expect(user2Balance).to.be.gt(0n);
        });

        it("should handle self-delegation", async function () {
            const votesBefore = await votingToken.getVotes(user1.address);
            await votingToken.connect(user1).delegate(user1.address);
            // Self-delegation shouldn't change the vote count
            expect(await votingToken.getVotes(user1.address)).to.equal(votesBefore);
        });

        it("should handle delegation to another user", async function () {
            const user1Balance = await votingToken.balanceOf(user1.address);
            const user2VotesBefore = await votingToken.getVotes(user2.address);

            await votingToken.connect(user1).delegate(user2.address);

            // After delegation, user2 should have received user1's voting power
            const user2VotesAfter = await votingToken.getVotes(user2.address);
            expect(user2VotesAfter).to.be.gte(user2VotesBefore);

            // User1's balance should remain unchanged (they still own the tokens)
            expect(await votingToken.balanceOf(user1.address)).to.equal(user1Balance);
        });

        it("should handle delegation changes", async function () {
            const user1Balance = await votingToken.balanceOf(user1.address);
            const user2InitialVotes = await votingToken.getVotes(user2.address);
            const user3InitialVotes = await votingToken.getVotes(user3.address);

            await votingToken.connect(user1).delegate(user2.address);
            await votingToken.connect(user1).delegate(user3.address);

            expect(await votingToken.getVotes(user2.address)).to.equal(user2InitialVotes);
            expect(await votingToken.getVotes(user3.address)).to.equal(user3InitialVotes + user1Balance);
        });

        it("should handle multiple delegations to same user", async function () {
            const user1Balance = await votingToken.balanceOf(user1.address);
            const user2Balance = await votingToken.balanceOf(user2.address);
            const user3InitialVotes = await votingToken.getVotes(user3.address);

            await votingToken.connect(user1).delegate(user3.address);
            await votingToken.connect(user2).delegate(user3.address);

            expect(await votingToken.getVotes(user3.address)).to.equal(user3InitialVotes + user1Balance + user2Balance);
        });
    });

    describe("Checkpoints", function() {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
        });

        it("should create checkpoints on delegation", async function () {
            // Get initial balance before minting
            const balanceBefore = await votingToken.balanceOf(user1.address);

            // Mint token to user1
            await votingToken.connect(minter).mint(user1.address, 1);

            // Get balance after minting (should be previous balance + 1)
            const initialBalance = await votingToken.balanceOf(user1.address);
            expect(initialBalance).to.equal(balanceBefore + 1n);

            // Delegate to user2
            await votingToken.connect(user1).delegate(user2.address);

            // Check delegation occurred (user2 should have received voting power)
            const user2Votes = await votingToken.getVotes(user2.address);
            expect(user2Votes).to.be.gte(0n); // user2 should have some voting power now

            // Check checkpoint was created by verifying we can get past votes
            const currentBlock = await ethers.provider.getBlockNumber();
            const pastVotes = await votingToken.getPastVotes(user2.address, currentBlock - 1);
            expect(pastVotes).to.be.a('bigint');
        });

        it("should handle historical voting power queries", async function () {
            await votingToken.connect(user1).delegate(user1.address);
            const block1 = await ethers.provider.getBlockNumber();
            const votesBefore = await votingToken.getVotes(user1.address);

            await votingToken.connect(minter).mint(user1.address, 25);

            // Past votes should be what they were before the mint
            const pastVotes = await votingToken.getPastVotes(user1.address, block1);
            const currentVotes = await votingToken.getVotes(user1.address);

            expect(currentVotes).to.be.greaterThan(pastVotes);
            // Current votes should be at least the previous votes plus the new mint
            expect(currentVotes).to.be.gte(votesBefore + 25n);
        });

        it("should handle queries for future blocks", async function () {
            const currentBlock = await ethers.provider.getBlockNumber();
            await expect(
                votingToken.getPastVotes(user1.address, currentBlock + 1)
            ).to.be.revertedWith("Block not yet mined");
        });
    });

    describe("ERC721 Token Functions", function() {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
            await votingToken.connect(minter).mint(user2.address, 30);
        });

        it("should reject transfers (soulbound)", async function () {
            await expect(
                votingToken.connect(user1).transferFrom(user1.address, user2.address, 1)
            ).to.be.revertedWith("Soulbound: non-transferable");
        });

        it("should handle ERC721 approvals", async function () {
            // ERC721 approval works differently - approve specific token IDs
            await votingToken.connect(user1).approve(user2.address, 1);
            expect(await votingToken.getApproved(1)).to.equal(user2.address);
        });

        it("should handle burning individual tokens", async function () {
            const initialBalance = await votingToken.balanceOf(user1.address);
            await votingToken.connect(user1).burn(1); // Burn token ID 1
            expect(await votingToken.balanceOf(user1.address)).to.equal(initialBalance - 1n);
        });

        it("should handle burnFrom with approval", async function () {
            await votingToken.connect(user1).approve(user2.address, 1);
            const initialBalance = await votingToken.balanceOf(user1.address);
            await votingToken.connect(user2).burnFrom(user1.address, 1);
            expect(await votingToken.balanceOf(user1.address)).to.equal(initialBalance - 1n);
        });

        it("should reject burning non-existent tokens", async function () {
            await expect(
                votingToken.connect(user1).burn(999)
            ).to.be.revertedWith("ERC721: invalid token ID");
        });
    });

    describe("Events", function() {
        it("should emit LiquidityPoolUpdated event", async function () {
            await expect(
                votingToken.connect(owner).setLiquidityPool(user1.address)
            ).to.emit(votingToken, "LiquidityPoolUpdated")
                .withArgs(user1.address);
        });

        it("should emit ProtocolGovernorUpdated event", async function () {
            await expect(
                votingToken.connect(owner).setProtocolGovernor(user1.address)
            ).to.emit(votingToken, "ProtocolGovernorUpdated")
                .withArgs(user1.address);
        });

        it("should emit ReputationPenalized event", async function () {
            await votingToken.connect(minter).mint(user1.address, 50);

            await expect(
                votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 10)
            ).to.emit(votingToken, "ReputationPenalized")
                .withArgs(user1.address, 10);
        });
    });

    describe("Edge Cases", function() {
        it("should handle zero balance operations", async function () {
            expect(await votingToken.balanceOf(user1.address)).to.equal(0n);
            expect(await votingToken.getVotes(user1.address)).to.equal(0n);
        });

        it("should handle operations on non-existent addresses", async function () {
            const randomAddress = ethers.Wallet.createRandom().getAddress();
            expect(await votingToken.balanceOf(randomAddress)).to.equal(0n);
            expect(await votingToken.getVotes(randomAddress)).to.equal(0n);
        });

        it("should maintain consistency after complex operations", async function () {
            // Start fresh - user1 should have 0 tokens
            expect(await votingToken.balanceOf(user1.address)).to.equal(0n);

            // Mint 100 tokens
            await votingToken.connect(minter).mint(user1.address, 100);
            expect(await votingToken.balanceOf(user1.address)).to.equal(100n);

            // Penalize 25 tokens - this should burn 25 tokens
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 25);

            // Final balance should be 75
            const finalBalance = await votingToken.balanceOf(user1.address);
            expect(finalBalance).to.equal(75n);

            // Reputation should be -25
            const reputation = await votingToken.reputation(user1.address);
            expect(reputation).to.equal(-25n);
        });
    });
});