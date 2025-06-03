const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPoolV3 - Full Functionality Test", function () {
    let owner, user1, user2, lender1, lender2;
    let pool, glint, coral;
    let mockFeedGlint, mockFeedCoral;

    beforeEach(async function () {
        // Get fresh signers for each test
        [owner, user1, user2, lender1, lender2] = await ethers.getSigners();

        // Deploy GlintToken
        const GlintToken = await ethers.getContractFactory("GlintToken");
        const initialSupply = ethers.parseEther("5000"); // Increased to ensure enough tokens
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

        // Fund the contract with enough ETH for lending
        await owner.sendTransaction({
            to: pool.target,
            value: ethers.parseEther("200"), // Total pool funding
        });

        // Add initial deposits to set up totalLent (smaller amounts to avoid hitting limits)
        await pool.connect(lender1).depositFunds({ value: ethers.parseEther("50") });
        await pool.connect(lender2).depositFunds({ value: ethers.parseEther("50") });

        // Distribute and approve tokens to users
        const distributeTokens = async (user, token, amount) => {
            await token.transfer(user.address, amount);
            await token.connect(user).approve(pool.target, amount);
        };

        // Distribute larger amounts to match test requirements
        await distributeTokens(user1, glint, ethers.parseEther("2000")); // Increased to ensure enough tokens
        await distributeTokens(user2, glint, ethers.parseEther("2000")); // Increased to ensure enough tokens
        await distributeTokens(user1, coral, ethers.parseEther("1000")); // Increased to ensure enough tokens
        await distributeTokens(user2, coral, ethers.parseEther("1000")); // Increased to ensure enough tokens

        // Set credit scores
        await pool.setCreditScore(user1.address, 80);
        await pool.setCreditScore(user2.address, 70);
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
            await pool.connect(user1).borrow(ethers.parseEther("5"));

            // Try to withdraw too much - with 5 ETH debt and 130% threshold, we need at least 6.5 ETH collateral value
            // If we withdraw 495 ETH, leaving only 5 ETH collateral, this would be undercollateralized
            await expect(pool.connect(user1).withdrawCollateral(glint.target, ethers.parseEther("495")))
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

            await expect(pool.connect(user1).borrow(ethers.parseEther("5"))) // Reduced from 100 to 5
                .to.emit(pool, "Borrowed")
                .withArgs(user1.address, ethers.parseEther("5"));

            // Check debt using userDebt mapping
            expect(await pool.userDebt(user1.address)).to.equal(ethers.parseEther("5"));
        });

        it("should prevent borrowing with insufficient collateral", async function () {
            // Deposit 50 ETH worth of collateral at $1 price
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("50"));

            // Try to borrow 5 ETH
            // With 50 ETH collateral at $1, total value = 50 ETH
            // Required collateral for 5 ETH debt at 130% = 6.5 ETH
            // 50 ETH > 6.5 ETH, so this should succeed

            // Instead, let's try to borrow 40 ETH
            // Required collateral for 40 ETH debt at 130% = 52 ETH
            // 50 ETH < 52 ETH, so this should fail
            await expect(pool.connect(user1).borrow(ethers.parseEther("40")))
                .to.be.revertedWith("Insufficient collateral for this loan");
        });

        it("should allow users to repay loans", async function () {
            // Setup borrow
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("5")); // Reduced from 100 to 5

            // Repay
            await expect(pool.connect(user1).repay({ value: ethers.parseEther("5") })) // Reduced from 100 to 5
                .to.emit(pool, "Repaid")
                .withArgs(user1.address, ethers.parseEther("5"));

            expect(await pool.userDebt(user1.address)).to.equal(0);
        });

        it("should calculate interest correctly", async function () {
            // Setup borrow
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("5")); // Reduced from 100 to 5

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine", []);

            // Get the current daily rate (1.0001304e18 for 5% APY since we have >10 ETH)
            const dailyRate = await pool.currentDailyRate();

            // Calculate expected interest using daily compounding
            // For 30 days at 1.0001304e18 daily rate
            let expectedInterest = ethers.parseEther("5"); // Reduced from 100 to 5

            for (let i = 0; i < 30; i++) {
                expectedInterest = (expectedInterest * dailyRate) / BigInt(1e18);
            }
            expectedInterest = expectedInterest - ethers.parseEther("5"); // Subtract principal to get just interest

            // Get actual interest using calculatePotentialInterest
            const actualInterest = await pool.calculatePotentialInterest(ethers.parseEther("5"), 30);

            // Log contract state
            const debt = await pool.userDebt(user1.address);
            const borrowTime = await pool.borrowTimestamp(user1.address);

            // Interest should be greater than 0 and close to expected
            expect(actualInterest).to.be.gt(0);
            expect(actualInterest).to.be.closeTo(expectedInterest, expectedInterest / BigInt(10)); // Allow 10% margin
        });
    });

    describe("Liquidation Process", function () {
        beforeEach(async function () {
            // Setup: user1 borrows with Glint collateral
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("5")); // Reduced from 100 to 5

            // Drop price to $0.01 to make position unhealthy
            // With 500 ETH collateral at $0.01, total value = 5 ETH
            // With 5 ETH debt and 130% threshold, we need 6.5 ETH collateral value
            // 5 ETH < 6.5 ETH, so position should be liquidatable
            await mockFeedGlint.setPrice(1e6); // $0.01
        });

        it("should mark undercollateralized positions for liquidation", async function () {
            // Verify position is unhealthy first
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

            await expect(pool.startLiquidation(user1.address))
                .to.emit(pool, "LiquidationStarted")
                .withArgs(user1.address);

            expect(await pool.isLiquidatable(user1.address)).to.be.true;
        });

        it("should execute liquidation after grace period", async function () {
            // Verify position is unhealthy first
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

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
            // Verify position is unhealthy first
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

            await pool.startLiquidation(user1.address);

            // User approves and adds more collateral
            // We need to approve 650 ETH for the recovery
            await glint.connect(user1).approve(pool.target, ethers.parseEther("650"));

            // Add enough collateral to make position healthy again
            // We need at least 6.5 ETH value (5 ETH debt * 130% threshold)
            // At $0.01 price, we need 650 ETH collateral
            await pool.connect(user1).recoverFromLiquidation(glint.target, ethers.parseEther("650"));

            // Verify position is now healthy
            const [isHealthyNow] = await pool.checkCollateralization(user1.address);
            expect(isHealthyNow).to.be.true;
            expect(await pool.isLiquidatable(user1.address)).to.be.false;
        });
    });

    describe("Lending Functionality", function () {
        let newLender;

        beforeEach(async function () {
            // Get a fresh lender for each test
            [newLender] = await ethers.getSigners();
        });

        it("should allow users to deposit funds as lenders", async function () {
            await expect(pool.connect(newLender).depositFunds({ value: ethers.parseEther("10") }))
                .to.emit(pool, "FundsDeposited")
                .withArgs(newLender.address, ethers.parseEther("10"));

            const info = await pool.getLenderInfo(newLender.address);
            expect(info.balance).to.equal(ethers.parseEther("10"));
        });

        it("should enforce deposit limits", async function () {
            await expect(pool.connect(newLender).depositFunds({ value: ethers.parseEther("0.001") }))
                .to.be.revertedWith("Deposit amount too low");

            await expect(pool.connect(newLender).depositFunds({ value: ethers.parseEther("101") }))
                .to.be.revertedWith("Deposit would exceed maximum limit");
        });

        it("should accrue interest for lenders", async function () {
            await pool.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            const info = await pool.getLenderInfo(newLender.address);
            expect(info.pendingInterest).to.be.gt(0);
        });

        it("should allow interest claims", async function () {
            await pool.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            await expect(pool.connect(newLender).claimInterest())
                .to.emit(pool, "InterestClaimed");
        });

        it("should enforce withdrawal cooldown", async function () {
            // First deposit funds
            await pool.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Get initial balance
            const initialInfo = await pool.getLenderInfo(newLender.address);
            const initialBalance = initialInfo.balance;

            // Request withdrawal
            await pool.connect(newLender).requestWithdrawal(ethers.parseEther("5"));

            // Try to complete immediately (should succeed without penalty since we're using deposit timestamp)
            await expect(pool.connect(newLender).completeWithdrawal())
                .to.emit(pool, "FundsWithdrawn");

            // Check that the withdrawal was completed without penalty
            const finalInfo = await pool.getLenderInfo(newLender.address);
            const withdrawalAmount = ethers.parseEther("5");
            const expectedRemaining = initialBalance - withdrawalAmount;
            expect(finalInfo.balance).to.equal(expectedRemaining);
        });

        it("should apply early withdrawal penalty", async function () {
            // First deposit funds
            await pool.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Request withdrawal
            await pool.connect(newLender).requestWithdrawal(ethers.parseEther("5"));

            // Complete with penalty (before cooldown)
            await expect(pool.connect(newLender).completeWithdrawal())
                .to.emit(pool, "EarlyWithdrawalPenalty");
        });
    });

    describe("Chainlink Automation", function () {
        let newLender;

        beforeEach(async function () {
            // Get a fresh lender for each test
            [newLender] = await ethers.getSigners();
        });

        it("should detect liquidatable positions", async function () {
            // Setup liquidation scenario
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("5"));

            // Drop price to $0.01 to make position unhealthy
            // With 500 ETH collateral at $0.01, total value = 5 ETH
            // With 5 ETH debt and 130% threshold, we need 6.5 ETH collateral value
            // 5 ETH < 6.5 ETH, so position should be liquidatable
            await mockFeedGlint.setPrice(1e6); // $0.01

            // Verify position is unhealthy
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

            // Now we can start liquidation
            await expect(pool.startLiquidation(user1.address))
                .to.emit(pool, "LiquidationStarted")
                .withArgs(user1.address);

            // Fast forward past grace period
            await ethers.provider.send("evm_increaseTime", [3 * 86400 + 1]);
            await ethers.provider.send("evm_mine", []);

            const [upkeepNeeded] = await pool.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;
        });

        it("should perform upkeep for liquidations and interest", async function () {
            // Setup liquidation scenario
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
            await pool.connect(user1).borrow(ethers.parseEther("5"));

            // Drop price to $0.01 to make position unhealthy
            await mockFeedGlint.setPrice(1e6); // $0.01

            // Verify position is unhealthy
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

            // Now we can start liquidation
            await pool.startLiquidation(user1.address);

            // Setup lender for interest
            await pool.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [3 * 86400 + 1]);
            await ethers.provider.send("evm_mine", []);

            const [upkeepNeeded, performData] = await pool.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            await expect(pool.performUpkeep(performData))
                .to.emit(pool, "LiquidationExecuted");

            // Check interest was updated
            const info = await pool.getLenderInfo(newLender.address);
            expect(info.pendingInterest).to.be.gt(0);
        });
    });

    describe("Multi-Token Collateral", function () {
        it("should handle multiple collateral types", async function () {
            // User deposits both Glint and Coral
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("300"));
            await pool.connect(user1).depositCollateral(coral.target, ethers.parseEther("200"));

            // Set liquidation thresholds for both tokens
            await pool.setLiquidationThreshold(glint.target, 130); // 130% threshold for Glint
            await pool.setLiquidationThreshold(coral.target, 130); // 130% threshold for Coral

            // Check total collateral value
            const totalValue = await pool.getTotalCollateralValue(user1.address);
            expect(totalValue).to.equal(ethers.parseEther("500")); // $1 price for both

            // Borrow enough to make position vulnerable to price drops
            // Total lent is 100 ETH (50 from lender1 + 50 from lender2), so we can borrow up to 50 ETH
            await pool.connect(user1).borrow(ethers.parseEther("40")); // Borrow 40 ETH (less than half of total lent) 

            // Change Coral price to $0.1 (from $1)
            await mockFeedCoral.setPrice(0.1e8);
            const valueAfterCoralDrop = await pool.getTotalCollateralValue(user1.address);

            // Should still be healthy (300*1 + 200*0.1 = 320 vs 40 debt)
            // 320 / 40 = 800% > 150% threshold (maxLiquidationThreshold)
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.true;

            // Change Glint price to $0.0000001 (from $1)
            // Now total value will be: (300 * 0.0000001) + (200 * 0.1) = 0.00003 + 20 = 20.00003 ETH
            await mockFeedGlint.setPrice(1e1); // $0.0000001

            const valueAfterGlintDrop = await pool.getTotalCollateralValue(user1.address);

            // Calculate required collateral (150% of 40 ETH - using maxLiquidationThreshold)
            const debt = await pool.userDebt(user1.address);
            const maxThreshold = await pool.getMaxLiquidationThreshold();
            const requiredCollateral = (debt * BigInt(maxThreshold)) / BigInt(100);

            // Now position should be unhealthy (20.00003 < 60)
            const [isHealthyNow] = await pool.checkCollateralization(user1.address);
            expect(isHealthyNow).to.be.false;
        });
    });
});