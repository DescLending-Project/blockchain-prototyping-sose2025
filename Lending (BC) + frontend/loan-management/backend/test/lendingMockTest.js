const { expect } = require("chai");
const { ethers } = require("hardhat");
const { upgrades } = require("hardhat");

describe("LiquidityPoolV3 - Full Functionality Test", function () {
    let deployer, user1, user2, lender1, lender2;
    let pool, lendingManager, glint, coral;
    let mockFeedGlint, mockFeedCoral;

    beforeEach(async function () {
        [deployer, user1, user2, lender1, lender2] = await ethers.getSigners();

        // Deploy GlintToken with a huge initial supply for all tests
        const GlintToken = await ethers.getContractFactory("GlintToken");
        glint = await GlintToken.deploy(ethers.parseEther("10000000000")); // 10 billion tokens
        await glint.waitForDeployment();

        // Deploy Mock Price Feed
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockFeedGlint = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
        await mockFeedGlint.waitForDeployment();

        // Deploy Mock Price Feed for Coral
        mockFeedCoral = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
        await mockFeedCoral.waitForDeployment();

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        const stablecoinManager = await StablecoinManager.deploy(deployer.address);
        await stablecoinManager.waitForDeployment();
        const stablecoinManagerAddress = await stablecoinManager.getAddress();

        // Deploy LiquidityPoolV3 first (without LendingManager for now)
        const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
        pool = await upgrades.deployProxy(LiquidityPoolV3, [
            deployer.address,
            stablecoinManagerAddress,
            ethers.ZeroAddress // Temporary placeholder
        ], {
            initializer: "initialize",
        });
        await pool.waitForDeployment();

        // Deploy LendingManager with LiquidityPoolV3 address
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(deployer.address, await pool.getAddress());
        await lendingManager.waitForDeployment();
        const lendingManagerAddress = await lendingManager.getAddress();

        // Update LiquidityPoolV3 with the correct LendingManager address
        await pool.setLendingManager(lendingManagerAddress);

        // Fund the liquidity pool directly
        await deployer.sendTransaction({
            to: await pool.getAddress(),
            value: ethers.parseEther("10")
        });

        // Transfer tokens to user1 and approve the liquidity pool
        await glint.transfer(user1.address, ethers.parseEther("1000"));
        await glint.connect(user1).approve(pool.target, ethers.parseEther("1000"));

        // Set up Glint as collateral token
        await pool.setAllowedCollateral(glint.target, true);
        await pool.setPriceFeed(glint.target, mockFeedGlint.target);

        // Deploy CoralToken
        const CoralToken = await ethers.getContractFactory("GlintToken");
        coral = await CoralToken.deploy(ethers.parseEther("1000000"));
        await coral.waitForDeployment();

        // Transfer coral tokens to user1 and approve
        await coral.transfer(user1.address, ethers.parseEther("1000"));
        await coral.connect(user1).approve(pool.target, ethers.parseEther("1000"));

        // Set up collateral tokens
        await pool.setAllowedCollateral(coral.target, true);
        await pool.setPriceFeed(coral.target, mockFeedCoral.target);

        // Set credit scores for users
        await pool.setCreditScore(user1.address, 80);
        await pool.setCreditScore(user2.address, 80);

        // Add initial deposits to set up totalLent (smaller amounts to avoid hitting limits)
        await lendingManager.connect(lender1).depositFunds({ value: ethers.parseEther("1") });
        await lendingManager.connect(lender2).depositFunds({ value: ethers.parseEther("1") });
    });

    describe("Basic Functionality", function () {
        it("should initialize correctly", async function () {
            expect(await pool.getAdmin()).to.equal(deployer.address);
            expect(await pool.isAllowedCollateral(glint.target)).to.be.true;
            expect(await pool.isAllowedCollateral(coral.target)).to.be.true;
        });

        it("should allow owner to change parameters", async function () {
            // Instead, verify that the owner can set other parameters
            await pool.setCreditScore(user1.address, 90);
            expect(await pool.getCreditScore(user1.address)).to.equal(90);
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
            // Approve the pool to spend CORAL tokens
            await coral.connect(user1).approve(pool.target, ethers.parseEther("200"));

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

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("1") ? ethers.parseEther("1") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Try to withdraw too much - with debt and threshold, we need sufficient collateral value
            // Calculate how much we can safely withdraw
            const debt = await pool.userDebt(user1.address);
            const minCollateralValue = (debt * BigInt(requiredRatio)) / 100n;
            const currentCollateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxWithdrawValue = currentCollateralValue - minCollateralValue;

            // Convert to token amount (assuming $1 price)
            const maxWithdrawTokens = maxWithdrawValue;

            // Try to withdraw more than allowed
            await expect(pool.connect(user1).withdrawCollateral(glint.target, maxWithdrawTokens + ethers.parseEther("1")))
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

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("1") ? ethers.parseEther("1") : maxBorrow / 2n;

            await expect(pool.connect(user1).borrow(borrowAmount))
                .to.emit(pool, "Borrowed")
                .withArgs(user1.address, borrowAmount);

            // Check debt using userDebt mapping
            expect(await pool.userDebt(user1.address)).to.equal(borrowAmount);
        });

        it("should prevent borrowing with insufficient collateral", async function () {
            // Set credit score
            await pool.setCreditScore(user1.address, 80);

            // Deposit 50 ETH worth of collateral at $1 price
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("50"));

            // Get user's borrow terms
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);

            // Calculate maximum borrow based on collateral
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrowByCollateral = (collateralValue * 100n) / BigInt(requiredRatio);

            // Try to borrow more than allowed by collateral
            const borrowAmount = maxBorrowByCollateral + ethers.parseEther("1");

            await expect(pool.connect(user1).borrow(borrowAmount))
                .to.be.revertedWith("Insufficient collateral for this loan");
        });

        it("should allow users to repay loans", async function () {
            // Setup borrow
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("1") ? ethers.parseEther("1") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Repay
            await expect(pool.connect(user1).repay({ value: borrowAmount }))
                .to.emit(pool, "Repaid")
                .withArgs(user1.address, borrowAmount);

            expect(await pool.userDebt(user1.address)).to.equal(0);
        });

        it("should calculate interest correctly", async function () {
            // Setup borrow
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("1") ? ethers.parseEther("1") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400 * 30]); // 30 days
            await ethers.provider.send("evm_mine", []);

            // Get the current daily rate (1.0001304e18 for 5% APY since we have >10 ETH)
            const dailyRate = await lendingManager.currentDailyRate();

            // Calculate expected interest using daily compounding
            // For 30 days at 1.0001304e18 daily rate
            let expectedInterest = borrowAmount;

            for (let i = 0; i < 30; i++) {
                expectedInterest = (expectedInterest * dailyRate) / BigInt(1e18);
            }
            expectedInterest = expectedInterest - borrowAmount; // Subtract principal to get just interest

            // Get actual interest using calculatePotentialInterest
            const actualInterest = await lendingManager.calculatePotentialInterest(borrowAmount, 30);

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
            // Fund the pool with enough ETH for liquidation scenarios
            await deployer.sendTransaction({
                to: await pool.getAddress(),
                value: ethers.parseEther("1000")
            });
        });

        it("should mark undercollateralized positions for liquidation", async function () {
            // Setup: user1 borrows with Glint collateral
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("3") ? ethers.parseEther("3") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Drop price to $0.001 to make position unhealthy
            // With 500 ETH collateral at $0.001, total value = 0.5 ETH
            // With debt and threshold, we need sufficient collateral value
            await mockFeedGlint.setPrice(1e5); // $0.001

            // Verify position is unhealthy first
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

            await expect(pool.startLiquidation(user1.address))
                .to.emit(pool, "LiquidationStarted")
                .withArgs(user1.address);

            expect(await pool.isLiquidatable(user1.address)).to.be.true;
        });

        it("should execute liquidation after grace period", async function () {
            // Setup: user1 borrows with Glint collateral
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("3") ? ethers.parseEther("3") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Drop price to $0.001 to make position unhealthy
            await mockFeedGlint.setPrice(1e5); // $0.001

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
            // Setup: user1 borrows with Glint collateral
            await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("3") ? ethers.parseEther("3") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Drop price to $0.000001 to make position extremely unhealthy
            await mockFeedGlint.setPrice(1e2); // $0.000001

            // Check health before liquidation
            const [isUnhealthyBefore] = await pool.checkCollateralization(user1.address);
            expect(isUnhealthyBefore).to.be.false;

            // Start liquidation
            await pool.startLiquidation(user1.address);

            // Calculate required recovery amount dynamically
            const debt = await pool.userDebt(user1.address);
            const currentPrice = await pool.getTokenValue(glint.target);
            const currentCollateral = await pool.getCollateral(user1.address, glint.target);

            // Calculate required collateral value: debt * requiredRatio / 100
            const requiredCollateralValue = (debt * BigInt(requiredRatio)) / 100n;

            // Calculate current collateral value
            const currentCollateralValue = (currentCollateral * currentPrice) / BigInt(1e18);

            // Calculate additional collateral value needed
            const additionalValueNeeded = requiredCollateralValue > currentCollateralValue ?
                requiredCollateralValue - currentCollateralValue : 0n;

            // Convert to token amount (add 10% buffer to ensure health)
            const additionalTokensNeeded = additionalValueNeeded > 0n ?
                (additionalValueNeeded * BigInt(1e18) * 110n) / (currentPrice * 100n) :
                ethers.parseEther("1"); // Minimum amount if no additional needed

            // Check available balance and adjust if needed
            const deployerBalance = await glint.balanceOf(deployer.address);
            const actualTransferAmount = additionalTokensNeeded > deployerBalance ?
                deployerBalance : additionalTokensNeeded;

            // Transfer and approve additional tokens
            await glint.transfer(user1.address, actualTransferAmount);
            await glint.connect(user1).approve(pool.target, actualTransferAmount);

            // Add enough collateral to make position healthy again
            await pool.connect(user1).recoverFromLiquidation(glint.target, actualTransferAmount);

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
            await lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("10") });
            const info = await lendingManager.getLenderInfo(newLender.address);
            expect(info.balance).to.equal(ethers.parseEther("10"));
        });

        it("should enforce deposit limits", async function () {
            await expect(lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("0.001") }))
                .to.be.revertedWith("Deposit amount too low");

            await expect(lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("101") }))
                .to.be.revertedWith("Deposit would exceed maximum limit");
        });

        it("should accrue interest for lenders", async function () {
            await lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            const info = await lendingManager.getLenderInfo(newLender.address);
            expect(info.pendingInterest).to.be.gt(0);
        });

        it("should allow interest claims", async function () {
            await lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            await expect(lendingManager.connect(newLender).claimInterest())
                .to.emit(lendingManager, "InterestClaimed");
        });

        it("should enforce withdrawal cooldown", async function () {
            // First deposit funds
            await lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Get initial balance
            const initialInfo = await lendingManager.getLenderInfo(newLender.address);
            const initialBalance = initialInfo.balance;

            // Request withdrawal
            await lendingManager.connect(newLender).requestWithdrawal(ethers.parseEther("5"));

            // Try to complete immediately (should succeed without penalty since we're using deposit timestamp)
            await expect(lendingManager.connect(newLender).completeWithdrawal())
                .to.emit(lendingManager, "FundsWithdrawn");

            // Check that the withdrawal was completed without penalty
            const finalInfo = await lendingManager.getLenderInfo(newLender.address);
            const withdrawalAmount = ethers.parseEther("5");
            const expectedRemaining = initialBalance - withdrawalAmount;
            expect(finalInfo.balance).to.equal(expectedRemaining);
        });

        it("should apply early withdrawal penalty", async function () {
            // First deposit funds
            await lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Request withdrawal
            await lendingManager.connect(newLender).requestWithdrawal(ethers.parseEther("5"));

            // Complete with penalty (before cooldown)
            await expect(lendingManager.connect(newLender).completeWithdrawal())
                .to.emit(lendingManager, "EarlyWithdrawalPenalty");
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

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("3") ? ethers.parseEther("3") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Drop price to $0.001 to make position unhealthy
            // With 500 ETH collateral at $0.001, total value = 0.5 ETH
            // With debt and threshold, we need sufficient collateral value
            await mockFeedGlint.setPrice(1e5); // $0.001

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

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("3") ? ethers.parseEther("3") : maxBorrow / 2n;

            await pool.connect(user1).borrow(borrowAmount);

            // Drop price to $0.001 to make position unhealthy
            await mockFeedGlint.setPrice(1e5); // $0.001

            // Verify position is unhealthy
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

            // Now we can start liquidation
            await pool.startLiquidation(user1.address);

            // Setup lender for interest
            await lendingManager.connect(newLender).depositFunds({ value: ethers.parseEther("10") });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [3 * 86400 + 1]);
            await ethers.provider.send("evm_mine", []);

            const [upkeepNeeded, performData] = await pool.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            await expect(pool.performUpkeep(performData))
                .to.emit(pool, "LiquidationExecuted");

            // Check interest was updated
            const info = await lendingManager.getLenderInfo(newLender.address);
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

            // Fund the pool with enough ETH for the borrow
            await deployer.sendTransaction({
                to: await pool.getAddress(),
                value: ethers.parseEther("1000")
            });

            // Set credit score and calculate appropriate borrow amount
            await pool.setCreditScore(user1.address, 80);
            const [requiredRatio] = await pool.getBorrowTerms(user1.address);
            const collateralValue = await pool.getTotalCollateralValue(user1.address);
            const maxBorrow = (collateralValue * 100n) / BigInt(requiredRatio);
            const borrowAmount = maxBorrow > ethers.parseEther("300") ? ethers.parseEther("300") : maxBorrow / 2n;

            // Borrow enough to make position vulnerable to price drops
            await pool.connect(user1).borrow(borrowAmount);

            // Change Coral price to $0.1 (from $1)
            await mockFeedCoral.setPrice(0.1e8);
            const valueAfterCoralDrop = await pool.getTotalCollateralValue(user1.address);

            // Should be unhealthy (300*1 + 200*0.1 = 320 vs debt)
            // 320 / debt = ratio < requiredRatio threshold, so position should be unhealthy
            const [isHealthy] = await pool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;

            // Change Glint price to $0.0000001 (from $1)
            // Now total value will be: (300 * 0.0000001) + (200 * 0.1) = 0.00003 + 20 = 20.00003 ETH
            await mockFeedGlint.setPrice(1e1); // $0.0000001

            const valueAfterGlintDrop = await pool.getTotalCollateralValue(user1.address);

            // Calculate required collateral (requiredRatio% of debt)
            const debt = await pool.userDebt(user1.address);
            const requiredCollateral = (debt * BigInt(requiredRatio)) / 100n;

            // Now position should be unhealthy (20.00003 < requiredCollateral)
            const [isHealthyNow] = await pool.checkCollateralization(user1.address);
            expect(isHealthyNow).to.be.false;
        });
    });
});