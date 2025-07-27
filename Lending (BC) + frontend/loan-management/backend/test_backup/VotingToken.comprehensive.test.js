const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VotingToken - Complete Coverage", function () {
    let votingToken;
    let owner, dao, minter, user1, user2, user3, protocolGovernor;

    beforeEach(async function () {
        [owner, dao, minter, user1, user2, user3, protocolGovernor] = await ethers.getSigners();

        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(dao.address);
        await votingToken.waitForDeployment();

        // Set up roles
        await votingToken.connect(dao).setLiquidityPool(minter.address);
        await votingToken.connect(dao).setProtocolGovernor(protocolGovernor.address);
    });

    describe("Initialization", function () {
        it("should initialize with correct DAO", async function () {
            expect(await votingToken.dao()).to.equal(dao.address);
        });

        it("should have correct name and symbol", async function () {
            expect(await votingToken.name()).to.equal("Voting Token");
            expect(await votingToken.symbol()).to.equal("VOTE");
        });

        it("should start with zero total supply", async function () {
            expect(await votingToken.totalSupply()).to.equal(0);
        });
    });

    describe("Access Control", function () {
        it("should allow DAO to set liquidity pool", async function () {
            await votingToken.connect(dao).setLiquidityPool(user1.address);
            expect(await votingToken.liquidityPool()).to.equal(user1.address);
        });

        it("should allow DAO to set protocol governor", async function () {
            await votingToken.connect(dao).setProtocolGovernor(user2.address);
            expect(await votingToken.protocolGovernor()).to.equal(user2.address);
        });

        it("should reject non-DAO setting liquidity pool", async function () {
            await expect(
                votingToken.connect(user1).setLiquidityPool(user2.address)
            ).to.be.revertedWith("Only DAO");
        });

        it("should reject non-DAO setting protocol governor", async function () {
            await expect(
                votingToken.connect(user1).setProtocolGovernor(user2.address)
            ).to.be.revertedWith("Only DAO");
        });

        it("should reject zero address for liquidity pool", async function () {
            await expect(
                votingToken.connect(dao).setLiquidityPool(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("should reject zero address for protocol governor", async function () {
            await expect(
                votingToken.connect(dao).setProtocolGovernor(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });
    });

    describe("Minting", function () {
        it("should allow liquidity pool to mint tokens", async function () {
            await expect(
                votingToken.connect(minter).mint(user1.address, 50)
            ).to.emit(votingToken, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, 50);

            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
            expect(await votingToken.totalSupply()).to.equal(50);
        });

        it("should reject minting from non-liquidity pool", async function () {
            await expect(
                votingToken.connect(user1).mint(user2.address, 50)
            ).to.be.revertedWith("Only LiquidityPool can mint");
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
            ).to.be.revertedWith("ERC20: mint to the zero address");
        });

        it("should handle multiple mints to same address", async function () {
            await votingToken.connect(minter).mint(user1.address, 30);
            await votingToken.connect(minter).mint(user1.address, 20);

            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
            expect(await votingToken.totalSupply()).to.equal(50);
        });

        it("should mint maximum allowed amount", async function () {
            await votingToken.connect(minter).mint(user1.address, 100);
            expect(await votingToken.balanceOf(user1.address)).to.equal(100);
        });

        it("should mint minimum allowed amount", async function () {
            await votingToken.connect(minter).mint(user1.address, 1);
            expect(await votingToken.balanceOf(user1.address)).to.equal(1);
        });
    });

    describe("Reputation System", function () {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
            await votingToken.connect(minter).mint(user2.address, 30);
        });

        it("should allow protocol governor to penalize reputation", async function () {
            await expect(
                votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 10)
            ).to.emit(votingToken, "ReputationPenalized")
                .withArgs(user1.address, 10);

            expect(await votingToken.balanceOf(user1.address)).to.equal(40);
            expect(await votingToken.reputation(user1.address)).to.equal(-10);
        });

        it("should reject reputation penalty from non-protocol governor", async function () {
            await expect(
                votingToken.connect(user1).penalizeReputation(user2.address, 10)
            ).to.be.revertedWith("Only ProtocolGovernor can penalize");
        });

        it("should handle zero penalty amount", async function () {
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 0);
            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
            expect(await votingToken.reputation(user1.address)).to.equal(0);
        });

        it("should handle penalty larger than balance", async function () {
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 60);
            expect(await votingToken.balanceOf(user1.address)).to.equal(0);
            expect(await votingToken.reputation(user1.address)).to.equal(-60);
        });

        it("should accumulate multiple penalties", async function () {
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 10);
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 5);

            expect(await votingToken.balanceOf(user1.address)).to.equal(35);
            expect(await votingToken.reputation(user1.address)).to.equal(-15);
        });
    });

    describe("Voting Power and Delegation", function () {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
            await votingToken.connect(minter).mint(user2.address, 30);
            await votingToken.connect(minter).mint(user3.address, 20);
        });

        it("should track voting power correctly", async function () {
            expect(await votingToken.getVotes(user1.address)).to.equal(50);
            expect(await votingToken.getVotes(user2.address)).to.equal(30);
        });

        it("should handle self-delegation", async function () {
            await votingToken.connect(user1).delegate(user1.address);
            expect(await votingToken.getVotes(user1.address)).to.equal(50);
        });

        it("should handle delegation to another user", async function () {
            await votingToken.connect(user1).delegate(user2.address);
            expect(await votingToken.getVotes(user2.address)).to.equal(80); // 30 + 50
            expect(await votingToken.getVotes(user1.address)).to.equal(0);
        });

        it("should handle delegation changes", async function () {
            await votingToken.connect(user1).delegate(user2.address);
            await votingToken.connect(user1).delegate(user3.address);

            expect(await votingToken.getVotes(user2.address)).to.equal(30);
            expect(await votingToken.getVotes(user3.address)).to.equal(70); // 20 + 50
        });

        it("should handle multiple delegations to same user", async function () {
            await votingToken.connect(user1).delegate(user3.address);
            await votingToken.connect(user2).delegate(user3.address);

            expect(await votingToken.getVotes(user3.address)).to.equal(100); // 20 + 50 + 30
        });
    });

    describe("Checkpoints", function () {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
        });

        it("should create checkpoints on delegation", async function () {
            const blockNumber = await ethers.provider.getBlockNumber();
            await votingToken.connect(user1).delegate(user1.address);

            expect(await votingToken.getPastVotes(user1.address, blockNumber)).to.equal(0);
            expect(await votingToken.getVotes(user1.address)).to.equal(50);
        });

        it("should handle historical voting power queries", async function () {
            await votingToken.connect(user1).delegate(user1.address);
            const block1 = await ethers.provider.getBlockNumber();

            await votingToken.connect(minter).mint(user1.address, 25);
            const block2 = await ethers.provider.getBlockNumber();

            expect(await votingToken.getPastVotes(user1.address, block1)).to.equal(50);
            expect(await votingToken.getVotes(user1.address)).to.equal(75);
        });

        it("should handle queries for future blocks", async function () {
            const currentBlock = await ethers.provider.getBlockNumber();
            await expect(
                votingToken.getPastVotes(user1.address, currentBlock + 1)
            ).to.be.revertedWith("ERC20Votes: block not yet mined");
        });
    });

    describe("Standard ERC20 Functions", function () {
        beforeEach(async function () {
            await votingToken.connect(minter).mint(user1.address, 50);
            await votingToken.connect(minter).mint(user2.address, 30);
        });

        it("should handle transfers", async function () {
            await expect(
                votingToken.connect(user1).transfer(user2.address, 20)
            ).to.emit(votingToken, "Transfer")
                .withArgs(user1.address, user2.address, 20);

            expect(await votingToken.balanceOf(user1.address)).to.equal(30);
            expect(await votingToken.balanceOf(user2.address)).to.equal(50);
        });

        it("should handle approvals and transferFrom", async function () {
            await votingToken.connect(user1).approve(user2.address, 25);
            expect(await votingToken.allowance(user1.address, user2.address)).to.equal(25);

            await votingToken.connect(user2).transferFrom(user1.address, user3.address, 25);
            expect(await votingToken.balanceOf(user3.address)).to.equal(25);
            expect(await votingToken.balanceOf(user1.address)).to.equal(25);
        });

        it("should handle burning", async function () {
            await expect(
                votingToken.connect(user1).burn(20)
            ).to.emit(votingToken, "Transfer")
                .withArgs(user1.address, ethers.ZeroAddress, 20);

            expect(await votingToken.balanceOf(user1.address)).to.equal(30);
            expect(await votingToken.totalSupply()).to.equal(60);
        });

        it("should handle burnFrom", async function () {
            await votingToken.connect(user1).approve(user2.address, 15);
            await votingToken.connect(user2).burnFrom(user1.address, 15);

            expect(await votingToken.balanceOf(user1.address)).to.equal(35);
            expect(await votingToken.totalSupply()).to.equal(65);
        });

        it("should reject transfers exceeding balance", async function () {
            await expect(
                votingToken.connect(user1).transfer(user2.address, 60)
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("should reject transferFrom exceeding allowance", async function () {
            await votingToken.connect(user1).approve(user2.address, 10);
            await expect(
                votingToken.connect(user2).transferFrom(user1.address, user3.address, 20)
            ).to.be.revertedWith("ERC20: insufficient allowance");
        });
    });

    describe("Events", function () {
        it("should emit LiquidityPoolUpdated event", async function () {
            await expect(
                votingToken.connect(dao).setLiquidityPool(user1.address)
            ).to.emit(votingToken, "LiquidityPoolUpdated")
                .withArgs(user1.address);
        });

        it("should emit ProtocolGovernorUpdated event", async function () {
            await expect(
                votingToken.connect(dao).setProtocolGovernor(user1.address)
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

    describe("Edge Cases", function () {
        it("should handle zero balance operations", async function () {
            expect(await votingToken.balanceOf(user1.address)).to.equal(0);
            expect(await votingToken.getVotes(user1.address)).to.equal(0);
        });

        it("should handle operations on non-existent addresses", async function () {
            const randomAddress = ethers.Wallet.createRandom().address;
            expect(await votingToken.balanceOf(randomAddress)).to.equal(0);
            expect(await votingToken.getVotes(randomAddress)).to.equal(0);
        });

        it("should maintain consistency after complex operations", async function () {
            await votingToken.connect(minter).mint(user1.address, 100);
            await votingToken.connect(user1).delegate(user1.address);
            await votingToken.connect(protocolGovernor).penalizeReputation(user1.address, 25);
            await votingToken.connect(user1).transfer(user2.address, 25);

            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
            expect(await votingToken.getVotes(user1.address)).to.equal(50);
            expect(await votingToken.reputation(user1.address)).to.equal(-25);
        });
    });
});