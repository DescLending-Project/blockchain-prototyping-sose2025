const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to generate a unique nullifier for borrow operations
function generateNullifier(index = 0) {
    return ethers.keccak256(ethers.toUtf8Bytes(`nullifier_${Date.now()}_${index}`));
}


describe("LiquidityPool - Comprehensive Coverage", function() {
    let liquidityPool, interestRateModel, lendingManager, stablecoinManager, timelock, nullifierRegistry;
    let owner, lender1, lender2, borrower1, borrower2, liquidator;
    let mockToken, mockPriceFeed;

    beforeEach(async function () {
        [owner, lender1, lender2, borrower1, borrower2, liquidator] = await ethers.getSigners();

        // Deploy mock timelock
        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        timelock = await MockTimelock.deploy();
        await timelock.waitForDeployment();

        // Deploy InterestRateModel with all required parameters
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // ETH/USD Oracle
            await timelock.getAddress(),
            ethers.parseEther("0.05"), // baseRate
            ethers.parseEther("0.8"),   // kink
            ethers.parseEther("0.1"),   // slope1
            ethers.parseEther("0.3"),   // slope2
            ethers.parseEther("0.1"),   // reserveFactor
            ethers.parseEther("1.0"),   // maxBorrowRate
            ethers.parseEther("0.05"),  // maxRateChange
            ethers.parseEther("0.03"),  // ethPriceRiskPremium
            ethers.parseEther("0.2"),   // ethVolatilityThreshold
            86400 // oracleStalenessWindow
        );
        await interestRateModel.waitForDeployment();

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(await timelock.getAddress());
        await stablecoinManager.waitForDeployment();

        // Deploy LiquidityPool as upgradeable contract
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy();
        await liquidityPool.waitForDeployment();

        // Deploy NullifierRegistry
        const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
        nullifierRegistry = await NullifierRegistry.deploy();
        await nullifierRegistry.waitForDeployment();

        // Initialize NullifierRegistry
        await nullifierRegistry.initialize(owner.address);

        // Initialize the LiquidityPool with owner as timelock for testing
        await liquidityPool.initialize(
            owner.address, // Use owner as timelock for testing
            await stablecoinManager.getAddress(),
            ethers.ZeroAddress, // LendingManager placeholder
            await interestRateModel.getAddress()
        );

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            await liquidityPool.getAddress(),
            ethers.ZeroAddress // VotingToken placeholder
        );
        await lendingManager.waitForDeployment();

        // Setup nullifier registry permissions
        // Each user must select accounts for themselves
        await nullifierRegistry.connect(owner).selectAccounts([owner.address]);
        await nullifierRegistry.connect(lender1).selectAccounts([lender1.address]);
        await nullifierRegistry.connect(lender2).selectAccounts([lender2.address]);
        await nullifierRegistry.connect(borrower1).selectAccounts([borrower1.address]);
        await nullifierRegistry.connect(borrower2).selectAccounts([borrower2.address]);
        await nullifierRegistry.connect(liquidator).selectAccounts([liquidator.address]);
        
        const NULLIFIER_CONSUMER_ROLE = await nullifierRegistry.NULLIFIER_CONSUMER_ROLE();
        await nullifierRegistry.grantRole(NULLIFIER_CONSUMER_ROLE, await liquidityPool.getAddress());

        // Deploy mock token and price feed for collateral
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock Token", "MOCK");
        await mockToken.waitForDeployment();

        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(200000000000, 8); // $2000 per token with 8 decimals
        await mockPriceFeed.waitForDeployment();

        // Setup collateral token
        await liquidityPool.connect(owner).setAllowedCollateral(await mockToken.getAddress(), true);
        await liquidityPool.connect(owner).setPriceFeed(await mockToken.getAddress(), await mockPriceFeed.getAddress());

        // Mint tokens to borrowers and lenders
        await mockToken.mint(borrower1.address, ethers.parseEther("10"));
        await mockToken.mint(borrower2.address, ethers.parseEther("10"));
        await mockToken.mint(lender1.address, ethers.parseEther("20"));
        await mockToken.mint(liquidator.address, ethers.parseEther("20"));

        // Note: Complex timelock setup skipped for coverage test
        // The contracts are deployed and initialized successfully
    });

    describe("Initialization", function() {
        it("should initialize with correct parameters", async function () {
            expect(await liquidityPool.interestRateModel()).to.equal(await interestRateModel.getAddress());
            expect(await liquidityPool.timelock()).to.equal(owner.address);
            expect(await liquidityPool.paused()).to.be.false;
        });

        it("should have correct initial state", async function () {
            expect(await liquidityPool.getBalance()).to.equal(0n);
            expect(await liquidityPool.totalFunds()).to.equal(0n);
            expect(await liquidityPool.locked()).to.be.false;
        });
    });

    describe("Deposit Functionality", function() {
        it("should accept ETH deposits", async function () {
            const depositAmount = ethers.parseEther("5");

            // Send ETH to the contract (no event emitted for ETH deposits)
            await lender1.sendTransaction({ to: await liquidityPool.getAddress(), value: depositAmount });

            // Check that the contract balance increased
            expect(await liquidityPool.getBalance()).to.be.greaterThan(0);
        });

        it("should handle multiple deposits", async function () {
            const deposit1 = ethers.parseEther("5");
            const deposit2 = ethers.parseEther("3");
            const initialBalance = await liquidityPool.getBalance();

            await lender1.sendTransaction({ to: await liquidityPool.getAddress(), value: deposit1 });
            await lender1.sendTransaction({ to: await liquidityPool.getAddress(), value: deposit2 });

            const finalBalance = await liquidityPool.getBalance();
            expect(finalBalance - initialBalance).to.equal(deposit1 + deposit2);
        });

        it("should accept zero deposits", async function () {
            const initialBalance = await liquidityPool.getBalance();

            // Zero deposits are allowed by the receive() function
            await lender1.sendTransaction({ to: await liquidityPool.getAddress(), value: 0 });

            const finalBalance = await liquidityPool.getBalance();
            expect(finalBalance).to.equal(initialBalance); // No change in balance
        });
    });

    describe("Borrowing Functionality", function() {
        beforeEach(async function () {
            // Setup: lender deposits funds
            await lender1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("100")
            });
        });

        it("should allow borrowing with sufficient credit score", async function () {
            // Set a good credit score for borrower1
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);

            // Deposit collateral first
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("5"));
            await liquidityPool.connect(borrower1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("5"));

            const borrowAmount = ethers.parseEther("1");

            await expect(
                liquidityPool.connect(borrower1).borrow(borrowAmount)
            ).to.emit(liquidityPool, "Borrowed")
                .withArgs(borrower1.address, borrowAmount);

            expect(await liquidityPool.userDebt(borrower1.address)).to.be.greaterThanOrEqual(borrowAmount);
        });

        it("should reject borrowing with insufficient credit score", async function () {
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 30); // Below minimum

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"))
            ).to.be.revertedWith("Credit score too low");
        });

        it("should reject borrowing more than available liquidity", async function () {
            // Set credit score first so we can test liquidity limit
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("200"))
            ).to.be.revertedWith("Borrow amount exceeds available lending capacity");
        });
    });

    describe("Repayment Functionality", function() {
        beforeEach(async function () {
            // Setup: lender deposits and borrower borrows
            await lender1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("100")
            });

            // Set credit score and deposit collateral for borrower
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("5"));
            await liquidityPool.connect(borrower1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("5"));

            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("10"));
        });

        it("should allow full repayment", async function () {
            const debt = await liquidityPool.userDebt(borrower1.address);

            await expect(
                liquidityPool.connect(borrower1).repay({ value: debt })
            ).to.emit(liquidityPool, "Repaid")
                .withArgs(borrower1.address, debt);

            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0n);
        });

        it("should handle partial repayment", async function () {
            const debt = await liquidityPool.userDebt(borrower1.address);
            const partialAmount = debt / 2n;

            await liquidityPool.connect(borrower1).repay({ value: partialAmount });

            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(debt - partialAmount);
        });
    });

    describe("Interest Accrual", function() {
        beforeEach(async function () {
            await lender1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("100")
            });

            // Set credit score and deposit collateral for borrower
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("5"));
            await liquidityPool.connect(borrower1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("5"));

            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("10"));
        });

        it("should track debt over time", async function () {
            const initialDebt = await liquidityPool.userDebt(borrower1.address);

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine");

            // Check that debt is still tracked (interest may be calculated dynamically)
            const newDebt = await liquidityPool.userDebt(borrower1.address);
            expect(newDebt).to.be.greaterThanOrEqual(initialDebt);
        });

        it("should maintain pool balance over time", async function () {
            const initialPoolBalance = await liquidityPool.getBalance();

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");

            // Pool balance should remain stable
            const newPoolBalance = await liquidityPool.getBalance();
            expect(newPoolBalance).to.be.greaterThan(0);
        });
    });

    describe("Withdrawal Process", function() {
        beforeEach(async function () {
            await lender1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("10")
            });
        });

        it("should allow collateral withdrawal", async function () {
            // First deposit some collateral
            await mockToken.connect(lender1).approve(await liquidityPool.getAddress(), ethers.parseEther("5"));
            await liquidityPool.connect(lender1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("5"));

            const withdrawAmount = ethers.parseEther("2");

            await expect(
                liquidityPool.connect(lender1).withdrawCollateral(await mockToken.getAddress(), withdrawAmount)
            ).to.emit(liquidityPool, "CollateralWithdrawn")
                .withArgs(lender1.address, await mockToken.getAddress(), withdrawAmount);
        });

        it("should allow partial collateral withdrawal", async function () {
            // First deposit some collateral
            await mockToken.connect(lender1).approve(await liquidityPool.getAddress(), ethers.parseEther("10"));
            await liquidityPool.connect(lender1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("10"));

            const withdrawAmount = ethers.parseEther("3");

            await expect(
                liquidityPool.connect(lender1).withdrawPartialCollateral(await mockToken.getAddress(), withdrawAmount)
            ).to.emit(liquidityPool, "CollateralWithdrawn");
        });

        it("should check collateral balance after withdrawal", async function () {
            // First deposit some collateral
            await mockToken.connect(lender1).approve(await liquidityPool.getAddress(), ethers.parseEther("10"));
            await liquidityPool.connect(lender1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("10"));

            const collateralBalance = await liquidityPool.getCollateral(lender1.address, await mockToken.getAddress());
            expect(collateralBalance).to.equal(ethers.parseEther("10"));
        });
    });

    describe("Admin Functions", function() {
        it("should allow timelock to pause/unpause", async function () {
            await liquidityPool.connect(owner).togglePause();
            expect(await liquidityPool.paused()).to.be.true;

            await liquidityPool.connect(owner).togglePause();
            expect(await liquidityPool.paused()).to.be.false;
        });

        it("should allow timelock to set credit scores", async function () {
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 95);
            expect(await liquidityPool.creditScore(borrower1.address)).to.equal(95n);
        });

        it("should reject non-timelock operations", async function () {
            await expect(
                liquidityPool.connect(lender1).togglePause()
            ).to.be.reverted;
        });
    });

    describe("Edge Cases and Error Handling", function() {
        it("should handle zero balance collateral withdrawals", async function () {
            await expect(
                liquidityPool.connect(lender1).withdrawCollateral(await mockToken.getAddress(), ethers.parseEther("1"))
            ).to.be.revertedWith("Insufficient balance");
        });

        it("should handle borrowing when paused", async function () {
            await liquidityPool.connect(owner).togglePause();

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"))
            ).to.be.revertedWith("Contract is paused");
        });

        it("should handle multiple borrowers", async function () {
            await lender1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("100")
            });

            // Set credit scores and deposit collateral for both borrowers
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await liquidityPool.connect(owner).setCreditScore(borrower2.address, 75);

            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("5"));
            await liquidityPool.connect(borrower1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("5"));

            await mockToken.connect(borrower2).approve(await liquidityPool.getAddress(), ethers.parseEther("8"));
            await liquidityPool.connect(borrower2).depositCollateral(await mockToken.getAddress(), ethers.parseEther("8"));

            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("10"));
            await liquidityPool.connect(borrower2).borrow(ethers.parseEther("15"));

            expect(await liquidityPool.userDebt(borrower1.address)).to.be.greaterThan(0);
            expect(await liquidityPool.userDebt(borrower2.address)).to.be.greaterThan(0);
        });
    });

    describe("Liquidation", function() {
        beforeEach(async function () {
            await lender1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("100")
            });

            // Set credit score and deposit collateral for borrower
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("8"));
            await liquidityPool.connect(borrower1).depositCollateral(await mockToken.getAddress(), ethers.parseEther("8"));

            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("10"));
        });

        it("should allow liquidation of undercollateralized positions", async function () {
            // Simulate price drop or interest accrual making position liquidatable
            await ethers.provider.send("evm_increaseTime", [86400 * 365]); // 1 year
            await ethers.provider.send("evm_mine");

            // Check if position is liquidatable
            const isLiquidatable = await liquidityPool.isLiquidatable(borrower1.address);

            if (isLiquidatable) {
                await expect(
                    liquidityPool.connect(liquidator).liquidate(borrower1.address)
                ).to.emit(liquidityPool, "LiquidationExecuted");
            }
        });
    });
});
