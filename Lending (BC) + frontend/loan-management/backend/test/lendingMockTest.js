const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPoolV3 - Full Functionality Test", function () {
    let owner, user1, user2, lender1, lender2;
    let pool, glint, coral;
    let mockFeedGlint, mockFeedCoral;

    beforeEach(async function () {
        [owner, user1, user2, lender1, lender2] = await ethers.getSigners();

        // Deploy GlintToken
        const GlintToken = await ethers.getContractFactory("GlintToken");
        const initialSupply = ethers.parseEther("100");
        glint = await GlintToken.deploy(initialSupply);
        await glint.waitForDeployment();

        // Deploy CoralToken (assuming same interface as GlintToken)
        const CoralToken = await ethers.getContractFactory("GlintToken");
        coral = await CoralToken.deploy(initialSupply);
        await coral.waitForDeployment();

        // Deploy Mock Price Feeds
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockFeedGlint = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
        await mockFeedGlint.waitForDeployment();

        mockFeedCoral = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
        await mockFeedCoral.waitForDeployment();

        // Deploy Liquidity Pool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPoolV3");
        pool = await LiquidityPool.deploy();
        await pool.waitForDeployment();

        // Initialize pool
        await pool.initialize(owner.address);

        // Set up collateral tokens
        await pool.setAllowedCollateral(glint.target, true);
        await pool.setAllowedCollateral(coral.target, true);

        // Set price feeds
        await pool.setPriceFeed(glint.target, mockFeedGlint.target);
        await pool.setPriceFeed(coral.target, mockFeedCoral.target);

        // Fund the contract with minimal amounts
        await owner.sendTransaction({
            to: pool.target,
            value: ethers.parseEther("1"),
        });

        // Distribute and approve tokens to users
        const distributeTokens = async (user, token) => {
            await token.transfer(user.address, ethers.parseEther("10"));
            await token.connect(user).approve(pool.target, ethers.parseEther("10"));
        };

        await distributeTokens(user1, glint);
        await distributeTokens(user2, glint);
        await distributeTokens(user1, coral);
        await distributeTokens(user2, coral);

        // Set credit scores
        await pool.setCreditScore(user1.address, 80);
        await pool.setCreditScore(user2.address, 70);

        // Deposit funds as lenders with minimal amounts
        await lender1.sendTransaction({
            to: pool.target,
            value: ethers.parseEther("0.5"),
        });
        await lender2.sendTransaction({
            to: pool.target,
            value: ethers.parseEther("0.5"),
        });
    });

    describe("Basic Functionality", function () {
        it("should initialize correctly", async function () {
            expect(await pool.getAdmin()).to.equal(owner.address);
            expect(await pool.isAllowedCollateral(glint.target)).to.be.true;
            expect(await pool.isAllowedCollateral(coral.target)).to.be.true;
        });

        it("should allow owner to change parameters", async function () {
            await pool.setMaxBorrowAmount(ethers.parseEther("500"));
            expect(await pool.getMaxBorrowAmount()).to.equal(ethers.parseEther("500"));

            await pool.setInterestRate(10);
            expect(await pool.getInterestRate()).to.equal(10);
        });
    });

    describe("Collateral Management", function () {
        it("should allow users to deposit and withdraw collateral (Glint)", async function () {
            // Deposit
            await expect(pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("100")))
                .to.emit(pool, "CollateralDeposited")
                .withArgs(user1.address, glint.target, ethers.parseEther("100"));

            expect(await pool.getCollateral(user1.address, glint.target)).to.equal(ethers.parseEther("100"));

            // Withdraw
            await expect(pool.connect(user1).withdrawCollateral(glint.target, ethers.parseEther("50")))
                .to.emit(pool, "CollateralWithdrawn")
                .withArgs(user1.address, glint.target, ethers.parseEther("50"));

            expect(await pool.getCollateral(user1.address, glint.target)).to.equal(ethers.parseEther("50"));
        });

        it("should allow users to deposit and withdraw collateral (Coral)", async function () {
            // Deposit
            await expect(pool.connect(user1).depositCollateral(coral.target, ethers.parseEther("200")))
                .to.emit(pool, "CollateralDeposited")
                .withArgs(user1.address, coral.target, ethers.parseEther("200"));

            // Withdraw
            await expect(pool.connect(user1).withdrawCollateral(coral.target, ethers.parseEther("100")))
                .to.emit(pool, "CollateralWithdrawn")
                .withArgs(user1.address, coral.target, ethers.parseEther("100"));
        });

        it("should prevent undercollateralized withdrawals", async function () {
            // Setup: deposit collateral and borrow
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("100"));

            // Try to withdraw too much
            await expect(pool.connect(user1).withdrawCollateral(glint.target, ethers.parseEther("400")))
                .to.be.revertedWith("Withdrawal would make position undercollateralized");
        });
    });

    describe("Borrowing and Repayment", function () {
        beforeEach(async function () {
            // Setup lenders
            await lender1.sendTransaction({
                to: pool.target,
                value: ethers.parseEther("500"),
            });
            await lender2.sendTransaction({
                to: pool.target,
                value: ethers.parseEther("500"),
            });
        });

        it("should allow users to borrow against collateral", async function () {
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));

            await expect(pool.connect(user1).borrow(ethers.parseEther("100")))
                .to.emit(pool, "Borrowed")
                .withArgs(user1.address, ethers.parseEther("100"));

            expect(await pool.getMyDebt(user1.address)).to.equal(ethers.parseEther("100"));
        });

        it("should prevent borrowing with insufficient collateral", async function () {
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("50"));

            await expect(pool.connect(user1).borrow(ethers.parseEther("100")))
                .to.be.revertedWith("Insufficient collateral for this loan");
        });

        it("should allow users to repay loans", async function () {
            // Setup borrow
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("100"));

            // Repay
            await expect(pool.connect(user1).repay({ value: ethers.parseEther("105") }))
                .to.emit(pool, "Repaid")
                .withArgs(user1.address, ethers.parseEther("105"));

            expect(await pool.getMyDebt(user1.address)).to.equal(0);
        });

        it("should calculate interest correctly", async function () {
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("100"));

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine", []);

            const interest = await pool.calculateInterest(user1.address);
            expect(interest).to.be.gt(0);
        });
    });

    describe("Liquidation Process", function () {
        beforeEach(async function () {
            // Setup: user1 borrows with Glint collateral
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("100"));

            // Drop price to trigger liquidation
            await mockFeedGlint.setPrice(2e7); // $0.20
        });

        it("should mark undercollateralized positions for liquidation", async function () {
            await expect(pool.startLiquidation(user1.address))
                .to.emit(pool, "LiquidationStarted")
                .withArgs(user1.address);

            expect(await pool.isLiquidatable(user1.address)).to.be.true;
        });

        it("should execute liquidation after grace period", async function () {
            await pool.startLiquidation(user1.address);

            // Fast forward past grace period
            await ethers.provider.send("evm_increaseTime", [3 * 86400 + 1]); // 3 days + 1 second
            await ethers.provider.send("evm_mine", []);

            await expect(pool.executeLiquidation(user1.address))
                .to.emit(pool, "LiquidationExecuted");

            expect(await pool.userDebt(user1.address)).to.equal(0);
            expect(await pool.getCollateral(user1.address, glint.target)).to.equal(0);
        });

        it("should allow recovery from liquidation", async function () {
            await pool.startLiquidation(user1.address);

            // User adds more collateral
            await glint.connect(user1).transfer(pool.target, ethers.parseEther("500"));
            await expect(pool.connect(user1).recoverFromLiquidation(glint.target, ethers.parseEther("500")))
                .to.not.be.reverted;

            expect(await pool.isLiquidatable(user1.address)).to.be.false;
        });
    });

    describe("Lending Functionality", function () {
        it("should allow users to deposit funds as lenders", async function () {
            await expect(pool.connect(lender1).depositFunds({ value: ethers.parseEther("10") }))
                .to.emit(pool, "FundsDeposited")
                .withArgs(lender1.address, ethers.parseEther("10"));

            const info = await pool.getLenderInfo(lender1.address);
            expect(info.balance).to.equal(ethers.parseEther("10"));
        });

        it("should enforce deposit limits", async function () {
            await expect(pool.connect(lender1).depositFunds({ value: ethers.parseEther("0.001") }))
                .to.be.revertedWith("Deposit amount too low");

            await expect(pool.connect(lender1).depositFunds({ value: ethers.parseEther("101") }))
                .to.be.revertedWith("Deposit would exceed maximum limit");
        });

        it("should accrue interest for lenders", async function () {
            await pool.connect(lender1).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            const info = await pool.getLenderInfo(lender1.address);
            expect(info.pendingInterest).to.be.gt(0);
        });

        it("should allow interest claims", async function () {
            await pool.connect(lender1).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            await expect(pool.connect(lender1).claimInterest())
                .to.emit(pool, "InterestClaimed");
        });

        it("should enforce withdrawal cooldown", async function () {
            await pool.connect(lender1).depositFunds({ value: ethers.parseEther("10") });

            // Request withdrawal
            await pool.connect(lender1).requestWithdrawal(ethers.parseEther("5"));

            // Try to complete immediately (should fail)
            await expect(pool.connect(lender1).completeWithdrawal())
                .to.be.revertedWith("Withdrawal not ready");

            // Fast forward cooldown period
            await ethers.provider.send("evm_increaseTime", [86400 + 1]);
            await ethers.provider.send("evm_mine", []);

            // Now should succeed
            await expect(pool.connect(lender1).completeWithdrawal())
                .to.emit(pool, "FundsWithdrawn");
        });

        it("should apply early withdrawal penalty", async function () {
            await pool.connect(lender1).depositFunds({ value: ethers.parseEther("10") });

            // Request and complete withdrawal immediately (with penalty)
            await pool.connect(lender1).requestWithdrawal(ethers.parseEther("5"));

            // Complete with penalty (before cooldown)
            await expect(pool.connect(lender1).completeWithdrawal())
                .to.emit(pool, "EarlyWithdrawalPenalty");
        });
    });

    describe("Chainlink Automation", function () {
        it("should detect liquidatable positions", async function () {
            // Setup liquidation scenario
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("100"));
            await mockFeedGlint.setPrice(2e7); // $0.20
            await pool.startLiquidation(user1.address);

            // Fast forward past grace period
            await ethers.provider.send("evm_increaseTime", [3 * 86400 + 1]);
            await ethers.provider.send("evm_mine", []);

            const [upkeepNeeded] = await pool.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;
        });

        it("should perform upkeep for liquidations and interest", async function () {
            // Setup liquidation scenario
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("100"));
            await mockFeedGlint.setPrice(2e7); // $0.20
            await pool.startLiquidation(user1.address);

            // Setup lender for interest
            await pool.connect(lender1).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [3 * 86400 + 1]);
            await ethers.provider.send("evm_mine", []);

            const [upkeepNeeded, performData] = await pool.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            await expect(pool.performUpkeep(performData))
                .to.emit(pool, "LiquidationExecuted");

            // Check interest was updated
            const info = await pool.getLenderInfo(lender1.address);
            expect(info.pendingInterest).to.be.gt(0);
        });
    });

    describe("Multi-Token Collateral", function () {
        it("should handle multiple collateral types", async function () {
            // User deposits both Glint and Coral
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("300"));
            await pool.connect(user1).depositCollateral(coral.target, ethers.parseEther("200"));

            // Check total collateral value
            const totalValue = await pool.getTotalCollateralValue(user1.address);
            expect(totalValue).to.equal(ethers.parseEther("500")); // $1 price for both

            // Borrow against combined collateral
            await pool.connect(user1).borrow(ethers.parseEther("100"));

            // Change Coral price to $0.5
            await mockFeedCoral.setPrice(0.5e8);

            // Should still be healthy (300*1 + 200*0.5 = 400 vs 100 debt)
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.true;

            // Change Glint price to $0.3 (now 300*0.3 + 200*0.5 = 190 vs 100 debt)
            await mockFeedGlint.setPrice(0.3e8);

            // Should be liquidatable now
            const [isHealthyNow] = await pool.checkCollateralization(user1.address);
            expect(isHealthyNow).to.be.false;
        });
    });
});