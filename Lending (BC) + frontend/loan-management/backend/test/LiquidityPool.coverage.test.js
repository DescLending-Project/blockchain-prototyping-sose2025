const { expect } = require("chai");
const { ethers } = require("hardhat");
require("chai").use(require("chai-as-promised"));

describe("LiquidityPool - Comprehensive Coverage", function () {
    let liquidityPool, stablecoinManager, interestRateModel, votingToken;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy dependencies first
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy();
        await stablecoinManager.deployed();

        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy();
        await interestRateModel.deployed();

        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy();
        await votingToken.deployed();

        // Deploy LiquidityPool with no constructor arguments
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy();
        await liquidityPool.deployed();

        // Initialize the pool
        await liquidityPool.initialize(
            stablecoinManager.address,
            interestRateModel.address,
            votingToken.address,
            owner.address // timelock
        );
    });

    describe("Constructor and Initial State", function () {
        it("should initialize with correct parameters", async function () {
            expect(await liquidityPool.stablecoinManager()).to.equal(stablecoinManager.address);
            expect(await liquidityPool.interestRateModel()).to.equal(interestRateModel.address);
            expect(await liquidityPool.timelock()).to.equal(owner.address);
        });
    });

    describe("Credit System Integration", function () {
        it("should update credit score from ZK", async function () {
            // Set credit system first
            await liquidityPool.setCreditSystem(owner.address);

            const newScore = 85;
            await liquidityPool.updateCreditScoreFromZK(user1.address, newScore);
            expect(await liquidityPool.creditScore(user1.address)).to.equal(newScore);
        });

        it("should reject credit score out of range", async function () {
            await liquidityPool.setCreditSystem(owner.address);

            await expect(
                liquidityPool.updateCreditScoreFromZK(user1.address, 150)
            ).to.be.revertedWith("Score out of range");
        });
    });
});
