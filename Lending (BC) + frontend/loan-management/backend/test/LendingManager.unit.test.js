const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingManager - Unit", function () {
    let lendingManager, liquidityPool, votingToken;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address);
        await votingToken.deployed();

        // Deploy MockLiquidityPool
        const MockLiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
        liquidityPool = await MockLiquidityPool.deploy();
        await liquidityPool.deployed();

        // Deploy LendingManager with correct constructor (2 arguments)
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            liquidityPool.address,
            votingToken.address
        );
        await lendingManager.deployed();
    });

    describe("Rate Management", function () {
        it("should allow owner to set current daily rate and revert for non-owner or invalid rate", async function () {
            const newRate = ethers.utils.parseEther("0.001"); // 0.1%

            await lendingManager.connect(owner).setCurrentDailyRate(newRate);
            expect(await lendingManager.currentDailyRate()).to.equal(newRate);

            // Test non-owner rejection
            await expect(
                lendingManager.connect(user1).setCurrentDailyRate(newRate)
            ).to.be.revertedWith("Ownable: caller is not the owner");

            // Test invalid rate (too low)
            await expect(
                lendingManager.connect(owner).setCurrentDailyRate(ethers.utils.parseEther("0.5"))
            ).to.be.revertedWith("Rate must be between 1.0 and 1.01");
        });

        it("should handle lending operations", async function () {
            await lendingManager.connect(user1).lend({ value: ethers.utils.parseEther("10") });
            expect(await lendingManager.lenderBalances(user1.address)).to.equal(ethers.utils.parseEther("10"));
        });

        it("should handle withdrawal requests", async function () {
            // First lend some funds
            await lendingManager.connect(user1).lend({ value: ethers.utils.parseEther("10") });

            // Then request withdrawal
            await lendingManager.connect(user1).requestWithdrawal(ethers.utils.parseEther("5"));

            const request = await lendingManager.withdrawalRequests(user1.address);
            expect(request.gt(0)).to.be.true;
        });
    });
}); 
