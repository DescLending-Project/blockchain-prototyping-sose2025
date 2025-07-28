const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingManager - Unit", function() {
    let lendingManager, liquidityPool, votingToken;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address);
        await votingToken.waitForDeployment();

        // Deploy MockLiquidityPool
        const MockLiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
        liquidityPool = await MockLiquidityPool.deploy();
        await liquidityPool.waitForDeployment();

        // Deploy LendingManager with correct constructor (2 arguments)
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            await liquidityPool.getAddress(),
            owner.address // timelock address
        );
        await lendingManager.waitForDeployment();

        // Set up VotingToken in LendingManager
        await lendingManager.setVotingToken(await votingToken.getAddress());

        // Set credit scores for users to enable lending
        await liquidityPool.setCreditScore(user1.address, 80);
    });

    describe("Rate Management", function() {
        it("should allow owner to set current daily rate and revert for non-owner or invalid rate", async function () {
            const newRate = ethers.parseUnits("1.001", 18); // 1.001 (0.1% daily rate)

            await lendingManager.connect(owner).setCurrentDailyRate(newRate);
            expect(await lendingManager.currentDailyRate()).to.equal(newRate);

            // Test non-timelock rejection
            await expect(
                lendingManager.connect(user1).setCurrentDailyRate(newRate)
            ).to.be.revertedWithCustomError(lendingManager, "OnlyTimelockLendingManager");

            // Test invalid rate (too low)
            await expect(
                lendingManager.connect(owner).setCurrentDailyRate(ethers.parseEther("0.5"))
            ).to.be.revertedWith("Invalid rate");
        });

        it("should handle lending operations", async function () {
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("10") });
            const lenderInfo = await lendingManager.getLenderInfo(user1.address);
            expect(lenderInfo.balance).to.equal(ethers.parseEther("10"));
        });

        it("should handle withdrawal requests", async function () {
            // First deposit some funds
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("10") });

            // Then request withdrawal
            await lendingManager.connect(user1).requestWithdrawal(ethers.parseEther("5"));

            const lenderInfo = await lendingManager.lenders(user1.address);
            expect(lenderInfo.pendingPrincipalWithdrawal).to.equal(ethers.parseEther("5"));
        });
    });
}); 