const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VotingToken - Coverage Boost", function () {
    let votingToken;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy VotingToken with correct constructor
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address); // Pass DAO address
        await votingToken.deployed();

        // Set up liquidity pool role for minting
        await votingToken.connect(owner).setLiquidityPool(owner.address);
    });

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            expect(await votingToken.totalSupply()).to.equal(0);
            expect(await votingToken.name()).to.equal("Voting Token");
            expect(await votingToken.symbol()).to.equal("VOTE");
        });
    });

    describe("Minting", function () {
        it("should allow DAO to mint tokens", async function () {
            await expect(
                votingToken.connect(owner).mint(user1.address, 50)
            ).to.emit(votingToken, "Transfer")
                .withArgs(ethers.constants.AddressZero, user1.address, 50);

            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
        });

        it("should reject minting from non-DAO", async function () {
            await expect(
                votingToken.connect(user1).mint(user2.address, 50)
            ).to.be.revertedWith("Only LiquidityPool can mint");
        });

        it("should handle multiple mints", async function () {
            await votingToken.connect(owner).mint(user1.address, 30);
            await votingToken.connect(owner).mint(user1.address, 20);

            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
        });

        it("should handle zero minting", async function () {
            await expect(
                votingToken.connect(owner).mint(user1.address, 0)
            ).to.be.revertedWith("Amount must be 1-100");
        });

        it("should handle large amounts", async function () {
            await expect(
                votingToken.connect(owner).mint(user1.address, 101)
            ).to.be.revertedWith("Amount must be 1-100");
        });
    });

    describe("Voting Power", function () {
        beforeEach(async function () {
            await votingToken.connect(owner).mint(user1.address, 50);
            await votingToken.connect(owner).mint(user2.address, 30);
        });

        it("should track voting power correctly", async function () {
            expect(await votingToken.getVotes(user1.address)).to.equal(50);
            expect(await votingToken.getVotes(user2.address)).to.equal(30);
        });

        it("should handle delegation", async function () {
            await votingToken.connect(user1).delegate(user2.address);
            expect(await votingToken.getVotes(user2.address)).to.equal(80); // 30 + 50
        });
    });

    describe("DAO Management", function () {
        it("should allow DAO to change DAO address", async function () {
            await votingToken.connect(owner).setLiquidityPool(user1.address);

            // Now user1 should be able to mint
            await votingToken.connect(user1).mint(user2.address, 25);
            expect(await votingToken.balanceOf(user2.address)).to.equal(25);
        });

        it("should reject DAO change from non-DAO", async function () {
            await expect(
                votingToken.connect(user1).setLiquidityPool(user2.address)
            ).to.be.revertedWith("Only DAO");
        });

        it("should emit DAO change event", async function () {
            await expect(
                votingToken.connect(owner).setLiquidityPool(user1.address)
            ).to.emit(votingToken, "LiquidityPoolUpdated")
                .withArgs(user1.address);
        });
    });

    describe("Token Transfers", function () {
        beforeEach(async function () {
            await votingToken.connect(owner).mint(user1.address, 50);
        });

        it("should allow token transfers", async function () {
            await votingToken.connect(user1).transfer(user2.address, 20);

            expect(await votingToken.balanceOf(user1.address)).to.equal(30);
            expect(await votingToken.balanceOf(user2.address)).to.equal(20);
        });

        it("should handle transfer approvals", async function () {
            await votingToken.connect(user1).approve(user2.address, 25);
            await votingToken.connect(user2).transferFrom(user1.address, user3.address, 25);

            expect(await votingToken.balanceOf(user3.address)).to.equal(25);
        });
    });

    describe("Burning", function () {
        beforeEach(async function () {
            await votingToken.connect(owner).mint(user1.address, 50);
        });

        it("should allow token burning", async function () {
            await votingToken.connect(user1).burn(20);
            expect(await votingToken.balanceOf(user1.address)).to.equal(30);
        });

        it("should handle burn from approval", async function () {
            await votingToken.connect(user1).approve(user2.address, 15);
            await votingToken.connect(user2).burnFrom(user1.address, 15);

            expect(await votingToken.balanceOf(user1.address)).to.equal(35);
        });
    });

    describe("Checkpoints", function () {
        it("should create checkpoints on delegation", async function () {
            await votingToken.connect(owner).mint(user1.address, 50);

            const blockNumber = await ethers.provider.getBlockNumber();
            await votingToken.connect(user1).delegate(user1.address);

            expect(await votingToken.getPastVotes(user1.address, blockNumber)).to.equal(0);
        });

        it("should handle multiple checkpoints", async function () {
            await votingToken.connect(owner).mint(user1.address, 30);
            await votingToken.connect(user1).delegate(user1.address);

            await votingToken.connect(owner).mint(user1.address, 20);

            expect(await votingToken.getVotes(user1.address)).to.equal(50);
        });
    });

    describe("Edge Cases", function () {
        it("should handle zero address operations", async function () {
            await expect(
                votingToken.connect(owner).mint(ethers.constants.AddressZero, 50)
            ).to.be.revertedWith("ERC20: mint to the zero address");
        });

        it("should handle maximum token amounts", async function () {
            // Test with maximum allowed amount (100)
            await votingToken.connect(owner).mint(user1.address, 100);
            expect(await votingToken.balanceOf(user1.address)).to.equal(100);
        });

        it("should handle reputation penalties", async function () {
            await votingToken.connect(owner).mint(user1.address, 50);
            await votingToken.connect(owner).setProtocolGovernor(owner.address);

            await votingToken.connect(owner).penalizeReputation(user1.address, 10);
            expect(await votingToken.balanceOf(user1.address)).to.equal(40);
        });
    });
});
