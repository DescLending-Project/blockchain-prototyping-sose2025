const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VotingToken - Coverage Boost", function () {
    let votingToken;
    let mockDAO;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy mock DAO
        mockDAO = owner; // Simplified for testing

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(mockDAO.address);
        await votingToken.deployed();
    });

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            expect(await votingToken.dao()).to.equal(mockDAO.address);
            expect(await votingToken.name()).to.equal("VotingToken");
            expect(await votingToken.symbol()).to.equal("VOTE");
        });

        it("should set correct roles", async function () {
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            const DEFAULT_ADMIN_ROLE = await votingToken.DEFAULT_ADMIN_ROLE();

            expect(await votingToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await votingToken.hasRole(MINTER_ROLE, mockDAO.address)).to.be.true;
        });
    });

    describe("Minting", function () {
        it("should mint tokens to users", async function () {
            await votingToken.mint(user1.address, 100);
            expect(await votingToken.balanceOf(user1.address)).to.equal(100);
        });

        it("should only allow minters to mint", async function () {
            await expect(
                votingToken.connect(user1).mint(user2.address, 100)
            ).to.be.revertedWith("AccessControl:");
        });

        it("should mint multiple tokens", async function () {
            await votingToken.mint(user1.address, 50);
            await votingToken.mint(user1.address, 30);
            expect(await votingToken.balanceOf(user1.address)).to.equal(80);
        });

        it("should handle zero amount minting", async function () {
            await votingToken.mint(user1.address, 0);
            expect(await votingToken.balanceOf(user1.address)).to.equal(0);
        });
    });

    describe("Slashing", function () {
        beforeEach(async function () {
            await votingToken.mint(user1.address, 100);
        });

        it("should slash tokens from users", async function () {
            await votingToken.connect(mockDAO).slash(user1.address, 30);
            expect(await votingToken.balanceOf(user1.address)).to.equal(70);
        });

        it("should only allow DAO to slash", async function () {
            await expect(
                votingToken.connect(user2).slash(user1.address, 30)
            ).to.be.revertedWith("Only DAO can slash");
        });

        it("should handle slashing more than balance", async function () {
            await votingToken.connect(mockDAO).slash(user1.address, 150);
            expect(await votingToken.balanceOf(user1.address)).to.equal(0);
        });

        it("should reject slashing zero address", async function () {
            await expect(
                votingToken.connect(mockDAO).slash(ethers.constants.AddressZero, 30)
            ).to.be.revertedWith("Invalid address");
        });

        it("should handle slashing user with no tokens", async function () {
            await expect(
                votingToken.connect(mockDAO).slash(user2.address, 30)
            ).to.be.revertedWith("No tokens to slash");
        });
    });

    describe("DAO Management", function () {
        it("should set new DAO", async function () {
            await votingToken.setDAO(user2.address);
            expect(await votingToken.dao()).to.equal(user2.address);
        });

        it("should only allow admin to set DAO", async function () {
            await expect(
                votingToken.connect(user1).setDAO(user2.address)
            ).to.be.revertedWith("AccessControl:");
        });

        it("should reject zero address as DAO", async function () {
            await expect(
                votingToken.setDAO(ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid DAO address");
        });
    });

    describe("Token Transfers", function () {
        beforeEach(async function () {
            await votingToken.mint(user1.address, 100);
        });

        it("should transfer tokens between users", async function () {
            const tokenId = await votingToken.tokenOfOwnerByIndex(user1.address, 0);
            await votingToken.connect(user1).transferFrom(user1.address, user2.address, tokenId);
            expect(await votingToken.balanceOf(user2.address)).to.equal(1);
            expect(await votingToken.balanceOf(user1.address)).to.equal(99);
        });

        it("should approve and transfer", async function () {
            const tokenId = await votingToken.tokenOfOwnerByIndex(user1.address, 0);
            await votingToken.connect(user1).approve(user2.address, tokenId);
            await votingToken.connect(user2).transferFrom(user1.address, user3.address, tokenId);
            expect(await votingToken.ownerOf(tokenId)).to.equal(user3.address);
        });
    });

    describe("Batch Operations", function () {
        it("should handle batch minting", async function () {
            const users = [user1.address, user2.address, user3.address];
            const amounts = [50, 75, 25];

            for (let i = 0; i < users.length; i++) {
                await votingToken.mint(users[i], amounts[i]);
            }

            expect(await votingToken.balanceOf(user1.address)).to.equal(50);
            expect(await votingToken.balanceOf(user2.address)).to.equal(75);
            expect(await votingToken.balanceOf(user3.address)).to.equal(25);
        });
    });
});
