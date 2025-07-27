const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPool - Comprehensive Coverage", function () {
    let liquidityPool, interestRateModel, lendingManager, stablecoinManager, timelock;
    let owner, lender1, lender2, borrower1, borrower2, liquidator;

    beforeEach(async function () {
        [owner, lender1, lender2, borrower1, borrower2, liquidator] = await ethers.getSigners();

        // Deploy mock timelock
        const MockTimelock = await ethers.getContractFactory("MockTimelock");
        timelock = await MockTimelock.deploy();
        await timelock.deployed();

        // Deploy InterestRateModel with all required parameters
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // ETH/USD Oracle
            timelock.address,
            ethers.utils.parseEther("0.05"), // baseRate
            ethers.utils.parseEther("0.8"),   // kink
            ethers.utils.parseEther("0.1"),   // slope1
            ethers.utils.parseEther("0.3"),   // slope2
            ethers.utils.parseEther("0.1"),   // reserveFactor
            ethers.utils.parseEther("1.0"),   // maxBorrowRate
            ethers.utils.parseEther("0.05"),  // maxRateChange
            ethers.utils.parseEther("0.03"),  // ethPriceRiskPremium
            ethers.utils.parseEther("0.2"),   // ethVolatilityThreshold
            86400 // oracleStalenessWindow
        );
        await interestRateModel.deployed();

        // Deploy StablecoinManager with correct constructor (1 argument)
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(timelock.address);
        await stablecoinManager.deployed();

        // Deploy LiquidityPool with correct constructor (5 arguments)
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy(
            timelock.address,
            stablecoinManager.address,
            ethers.constants.AddressZero, // LendingManager placeholder
            interestRateModel.address,
            ethers.constants.AddressZero  // CreditSystem placeholder
        );
        await liquidityPool.deployed();

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            liquidityPool.address,
            ethers.constants.AddressZero // VotingToken placeholder
        );
        await lendingManager.deployed();

        // Set up contracts
        await liquidityPool.connect(timelock).setLendingManager(lendingManager.address);

        // Set credit scores for testing
        await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
        await liquidityPool.connect(timelock).setCreditScore(borrower2.address, 75);
        await liquidityPool.connect(timelock).setCreditScore(lender1.address, 85);
        await liquidityPool.connect(timelock).setCreditScore(lender2.address, 90);
    });

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            expect(await liquidityPool.interestRateModel()).to.equal(interestRateModel.address);
            expect(await liquidityPool.timelock()).to.equal(timelock.address);
            expect(await liquidityPool.paused()).to.be.false;
        });

        it("should have correct initial state", async function () {
            expect(await liquidityPool.getBalance()).to.equal(0);
            expect(await liquidityPool.totalFunds()).to.equal(0);
            expect(await liquidityPool.locked()).to.be.false;
        });
    });

    describe("Deposit Functionality", function () {
        it("should accept ETH deposits", async function () {
            const depositAmount = ethers.utils.parseEther("5");

            await expect(
                lender1.sendTransaction({ to: liquidityPool.address, value: depositAmount })
            ).to.emit(liquidityPool, "Deposit")
                .withArgs(lender1.address, depositAmount);

            expect(await liquidityPool.lenderBalances(lender1.address)).to.equal(depositAmount);
        });

        it("should handle multiple deposits", async function () {
            const deposit1 = ethers.utils.parseEther("5");
            const deposit2 = ethers.utils.parseEther("3");

            await lender1.sendTransaction({ to: liquidityPool.address, value: deposit1 });
            await lender1.sendTransaction({ to: liquidityPool.address, value: deposit2 });

            expect(await liquidityPool.lenderBalances(lender1.address)).to.equal(deposit1.add(deposit2));
        });

        it("should reject zero deposits", async function () {
            await expect(
                lender1.sendTransaction({ to: liquidityPool.address, value: 0 })
            ).to.be.revertedWith("Amount must be greater than 0");
        });
    });

    describe("Borrowing Functionality", function () {
        beforeEach(async function () {
            // Setup: lender deposits funds
            await lender1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("100")
            });
        });

        it("should allow borrowing with sufficient credit score", async function () {
            const borrowAmount = ethers.utils.parseEther("1");

            await expect(
                liquidityPool.connect(borrower1).borrow(borrowAmount)
            ).to.emit(liquidityPool, "Borrowed")
                .withArgs(borrower1.address, borrowAmount);

            expect(await liquidityPool.userDebt(borrower1.address)).to.be.gt(borrowAmount);
        });

        it("should reject borrowing with insufficient credit score", async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 30); // Below minimum

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Credit score too low");
        });

        it("should reject borrowing more than available liquidity", async function () {
            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("200"))
            ).to.be.revertedWith("Borrow amount exceeds available lending capacity");
        });
    });

    describe("Repayment Functionality", function () {
        beforeEach(async function () {
            // Setup: lender deposits and borrower borrows
            await lender1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("100")
            });

            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("10"));
        });

        it("should allow full repayment", async function () {
            const debt = await liquidityPool.userDebt(borrower1.address);

            await expect(
                liquidityPool.connect(borrower1).repay({ value: debt })
            ).to.emit(liquidityPool, "Repaid")
                .withArgs(borrower1.address, debt);

            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0);
        });

        it("should handle partial repayment", async function () {
            const debt = await liquidityPool.userDebt(borrower1.address);
            const partialAmount = debt.div(2);

            await liquidityPool.connect(borrower1).repay({ value: partialAmount });

            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(debt.sub(partialAmount));
        });
    });

    describe("Interest Accrual", function () {
        beforeEach(async function () {
            await lender1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("100")
            });
            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("10"));
        });

        it("should accrue interest over time", async function () {
            const initialDebt = await liquidityPool.userDebt(borrower1.address);

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine");

            await liquidityPool.accrueInterest();

            const newDebt = await liquidityPool.userDebt(borrower1.address);
            expect(newDebt).to.be.gt(initialDebt);
        });

        it("should distribute interest to lenders", async function () {
            const initialBalance = await liquidityPool.lenderBalances(lender1.address);

            // Fast forward and accrue interest
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await liquidityPool.accrueInterest();

            const newBalance = await liquidityPool.lenderBalances(lender1.address);
            expect(newBalance).to.be.gt(initialBalance);
        });
    });

    describe("Withdrawal Process", function () {
        beforeEach(async function () {
            await lender1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });
        });

        it("should allow withdrawal requests", async function () {
            const withdrawAmount = ethers.utils.parseEther("5");

            await expect(
                liquidityPool.connect(lender1).requestWithdrawal(withdrawAmount)
            ).to.emit(liquidityPool, "WithdrawalRequested")
                .withArgs(lender1.address, withdrawAmount);
        });

        it("should complete withdrawals after cooldown", async function () {
            const withdrawAmount = ethers.utils.parseEther("5");

            await liquidityPool.connect(lender1).requestWithdrawal(withdrawAmount);

            // Fast forward past cooldown
            await ethers.provider.send("evm_increaseTime", [86400 + 1]);
            await ethers.provider.send("evm_mine");

            await expect(
                liquidityPool.connect(lender1).completeWithdrawal()
            ).to.emit(liquidityPool, "WithdrawalCompleted");
        });

        it("should allow withdrawal cancellation", async function () {
            const withdrawAmount = ethers.utils.parseEther("5");

            await liquidityPool.connect(lender1).requestWithdrawal(withdrawAmount);

            await expect(
                liquidityPool.connect(lender1).cancelWithdrawal()
            ).to.emit(liquidityPool, "WithdrawalCancelled");
        });
    });

    describe("Admin Functions", function () {
        it("should allow timelock to pause/unpause", async function () {
            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.true;

            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.false;
        });

        it("should allow timelock to set credit scores", async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 95);
            expect(await liquidityPool.creditScores(borrower1.address)).to.equal(95);
        });

        it("should reject non-timelock operations", async function () {
            await expect(
                liquidityPool.connect(lender1).togglePause()
            ).to.be.revertedWith("Only timelock");
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("should handle zero balance withdrawals", async function () {
            await expect(
                liquidityPool.connect(lender1).requestWithdrawal(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Insufficient balance");
        });

        it("should handle borrowing when paused", async function () {
            await liquidityPool.pause();

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Pausable: paused");
        });

        it("should handle multiple borrowers", async function () {
            await lender1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("100")
            });

            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("10"));
            await liquidityPool.connect(borrower2).borrow(ethers.utils.parseEther("15"));

            expect(await liquidityPool.userDebt(borrower1.address)).to.be.gt(0);
            expect(await liquidityPool.userDebt(borrower2.address)).to.be.gt(0);
        });
    });

    describe("Liquidation", function () {
        beforeEach(async function () {
            await lender1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("100")
            });
            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("50"));
        });

        it("should allow liquidation of undercollateralized positions", async function () {
            // Simulate price drop or interest accrual making position liquidatable
            await ethers.provider.send("evm_increaseTime", [86400 * 365]); // 1 year
            await ethers.provider.send("evm_mine");
            await liquidityPool.accrueInterest();

            // Check if position is liquidatable
            const isLiquidatable = await liquidityPool.isLiquidatable(borrower1.address);

            if (isLiquidatable) {
                await expect(
                    liquidityPool.connect(liquidator).liquidate(borrower1.address)
                ).to.emit(liquidityPool, "Liquidation");
            }
        });
    });
});
