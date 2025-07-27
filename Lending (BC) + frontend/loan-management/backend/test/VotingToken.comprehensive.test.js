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
            ).to.be.revertedWith("AccessControl:");
        });

        it("should reject non-admin setting protocol governor", async function () {
            await expect(
                votingToken.connect(user1).setProtocolGovernor(user2.address)
            ).to.be.revertedWith("AccessControl:");
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
            ).to.be.revertedWith("AccessControl:");
        });

        it("should reject minting zero amount", async function () {
            await expect(
                votingToken.connect(minter).mint(user1.address, 0)
            ).to.be.revertedWith("Amount must be 1-100");
        });

        it("should reject minting over 100", async function () {
            await expect(
                votingToken.connect(minter).mint(user1.address, 101)
            ).to.be.revertedWithCustomError("Amount must be 1-100");
        });

        it("should reject minting to zero address", async function () {
            await expect(
                votingToken.connect(minter).mint(ethers.ZeroAddress, 50)
            ).to.be.revertedWithCustomError("ERC20: mint to the zero address");
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
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 60);
            expect(await votingToken.balanceOf(user1.address)).to.equal(0n);
            expect(await votingToken.reputation(user1.address)).to.equal(-60);
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
        });

        it("should track voting power correctly", async function () {
            expect(await votingToken.getVotes(user1.address)).to.equal(50n);
            expect(await votingToken.getVotes(user2.address)).to.equal(30n);
        });

        it("should handle self-delegation", async function () {
            await votingToken.connect(user1).delegate(user1.address);
            expect(await votingToken.getVotes(user1.address)).to.equal(50n);
        });

        it("should handle delegation to another user", async function () {
            await votingToken.connect(user1).delegate(user2.address);
            expect(await votingToken.getVotes(user2.address)).to.equal(80n); // 30 + 50
            expect(await votingToken.getVotes(user1.address)).to.equal(0n);
        });

        it("should handle delegation changes", async function () {
            await votingToken.connect(user1).delegate(user2.address);
            await votingToken.connect(user1).delegate(user3.address);

            expect(await votingToken.getVotes(user2.address)).to.equal(30n);
            expect(await votingToken.getVotes(user3.address)).to.equal(70n); // 20 + 50
        });

        it("should handle multiple delegations to same user", async function () {
            await votingToken.connect(user1).delegate(user3.address);
            await votingToken.connect(user2).delegate(user3.address);

            expect(await votingToken.getVotes(user3.address)).to.equal(100n); // 20 + 50 + 30
        });
    });

    describe("Checkpoints", function() {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
        });

        it("should create checkpoints on delegation", async function () {
            // Mint token to user1
            await votingToken.connect(minter).mint(user1.address, 1);

            // Get initial votes (should be 1)
            const initialBalance = await votingToken.balanceOf(user1.address);
            expect(initialBalance).to.equal(1n);

            // Delegate to user2
            await votingToken.connect(user1).delegate(user2.address);

            // Check votes were transferred
            expect(await votingToken.getVotes(user1.address)).to.equal(0n);
            expect(await votingToken.getVotes(user2.address)).to.equal(initialBalance);

            // Check checkpoint was created (simplified test)
            const checkpointCount = await votingToken.numCheckpoints(user2.address);
            expect(checkpointCount).to.be.greaterThan(0n);
        });

        it("should handle historical voting power queries", async function () {
            await votingToken.connect(user1).delegate(user1.address);
            const block1 = await ethers.provider.getBlockNumber();

            await votingToken.connect(minter).mint(user1.address, 25);
            const block2 = await ethers.provider.getBlockNumber();

            expect(await votingToken.getPastVotes(user1.address, block1)).to.equal(50n);
            expect(await votingToken.getVotes(user1.address)).to.equal(75n);
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
            await votingToken.connect(minter).mint(user1.address, 100);
            await votingToken.connect(user1).delegate(user1.address);
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 25);

            // Since tokens are soulbound, we can't transfer them
            // Instead, test that the reputation penalty worked correctly
            expect(await votingToken.balanceOf(user1.address)).to.equal(75n); // 100 - 25 burned
            expect(await votingToken.getVotes(user1.address)).to.equal(75n);
            expect(await votingToken.reputation(user1.address)).to.equal(-25n);
        });
    });
});