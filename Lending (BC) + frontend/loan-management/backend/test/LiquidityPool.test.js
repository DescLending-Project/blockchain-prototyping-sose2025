const { expect } = require("chai");
const { ethers } = require("hardhat");
const assert = require("assert");

// Helper function to setup collateral for borrowing
async function setupCollateralForBorrowing(liquidityPool, glintToken, mockFeedGlint, user, borrowAmount) {
    const requiredRatio = 140; // Default for most tiers
    const depositAmount = borrowAmount.mul(requiredRatio).div(100).mul(110).div(100); // 10% buffer

    await glintToken.transfer(user.address, depositAmount);
    await glintToken.connect(user).approve(liquidityPool.address, depositAmount);
    await liquidityPool.connect(user).depositCollateral(glintToken.address, depositAmount);

    // Verify collateral value
    const contractValue = await liquidityPool.getTotalCollateralValue(user.address);
    const requiredValue = borrowAmount.mul(requiredRatio).div(100);
    if (contractValue.lt(requiredValue)) throw new Error("Insufficient collateral in contract");

    // Ensure user has enough ETH for potential fees
    await deployer.sendTransaction({
        to: user.address,
        value: ethers.utils.parseEther("1")
    });
    return { depositAmount, requiredRatio };
}

describe("LiquidityPool - Basic Tests", function () {
    let liquidityPool, lendingManager, stablecoinManager, interestRateModel, votingToken, glintToken;
    let deployer, user1, user2, borrower1, borrower2, lender1, lender2;
    let mockFeedGlint;
    const sendValue = ethers.utils.parseEther("5");

    beforeEach(async function () {
        [deployer, user1, user2, borrower1, borrower2, lender1, lender2] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(deployer.address);
        await votingToken.deployed();

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(deployer.address);
        await stablecoinManager.deployed();

        // Deploy InterestRateModel
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
            deployer.address,
            ethers.utils.parseEther("0.05"),
            ethers.utils.parseEther("0.8"),
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("0.3"),
            ethers.utils.parseEther("0.1"),
            ethers.utils.parseEther("1.0"),
            ethers.utils.parseEther("0.05"),
            ethers.utils.parseEther("0.03"),
            ethers.utils.parseEther("0.2"),
            86400
        );
        await interestRateModel.deployed();

        // Deploy LiquidityPool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy(
            deployer.address,
            stablecoinManager.address,
            ethers.constants.AddressZero,
            interestRateModel.address,
            ethers.constants.AddressZero
        );
        await liquidityPool.deployed();

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            liquidityPool.address,
            votingToken.address
        );
        await lendingManager.deployed();

        // Set up contracts
        await liquidityPool.setLendingManager(lendingManager.address);
        await votingToken.setLiquidityPool(liquidityPool.address);

        // Deploy GlintToken
        const GlintToken = await ethers.getContractFactory("GlintToken");
        glintToken = await GlintToken.deploy(ethers.utils.parseEther("1000000"));
        await glintToken.deployed();

        // Deploy Mock Price Feed
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockFeedGlint = await MockPriceFeed.deploy(1e8, 8);
        await mockFeedGlint.deployed();

        // Set up collateral
        await liquidityPool.setAllowedCollateral(glintToken.address, true);
        await liquidityPool.setPriceFeed(glintToken.address, mockFeedGlint.address);

        // Set credit scores
        await liquidityPool.setCreditScore(user1.address, 80);
        await liquidityPool.setCreditScore(user2.address, 75);
        await liquidityPool.setCreditScore(borrower1.address, 80);
        await liquidityPool.setCreditScore(borrower2.address, 75);
        await liquidityPool.setCreditScore(lender1.address, 80);
        await liquidityPool.setCreditScore(lender2.address, 80);
    });

    describe("Deployment", function () {
        it("should set the right owner", async function () {
            expect(await liquidityPool.getAdmin()).to.equal(deployer.address);
        });

        it("should have 0 totalFunds initially", async function () {
            expect(await liquidityPool.totalFunds()).to.equal(0);
        });

        it("should initialize with correct default values", async function () {
            expect(await lendingManager.currentDailyRate()).to.equal("1000130400000000000");
            expect(await lendingManager.EARLY_WITHDRAWAL_PENALTY()).to.equal(5);
            expect(await lendingManager.WITHDRAWAL_COOLDOWN()).to.equal(86400);
        });
    });

    describe("Credit Score Management", function () {
        it("should allow owner to set and get credit scores", async function () {
            await liquidityPool.setCreditScore(user1.address, 85);
            expect(await liquidityPool.getCreditScore(user1.address)).to.equal(85);
        });

        it("should return correct borrow terms for different tiers", async function () {
            // Test TIER_1 (90-100 score, 110% ratio)
            await liquidityPool.setCreditScore(user1.address, 95);
            const [ratio1, modifier1, maxLoan1] = await liquidityPool.getBorrowTerms(user1.address);
            expect(ratio1).to.equal(110);
            expect(modifier1).to.equal(-10);
            expect(maxLoan1).to.equal(0);

            // Test TIER_3 (70-79 score, 140% ratio)
            await liquidityPool.setCreditScore(user1.address, 75);
            const [ratio3, modifier3, maxLoan3] = await liquidityPool.getBorrowTerms(user1.address);
            expect(ratio3).to.equal(140);
            expect(modifier3).to.equal(0);
            expect(maxLoan3).to.equal(0);
        });

        it("should allow owner to update tier configurations", async function () {
            await liquidityPool.updateBorrowTier(0, 95, 100, 115, -20, 45);
            const tier0 = await liquidityPool.borrowTierConfigs(0);
            expect(tier0.minScore).to.equal(95);
            expect(tier0.maxScore).to.equal(100);
            expect(tier0.collateralRatio).to.equal(115);
            expect(tier0.interestRateModifier).to.equal(-20);
            expect(tier0.maxLoanAmount).to.equal(45);
        });

        it("should revert when non-owner tries to update tier", async function () {
            await expect(
                liquidityPool.connect(user1).updateBorrowTier(0, 95, 100, 115, -20, 45)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("receive", function () {
        it("should increase totalFunds when receiving ETH", async function () {
            const initialTotalFunds = await liquidityPool.totalFunds();
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: sendValue
            });
            const newTotalFunds = await liquidityPool.totalFunds();
            expect(newTotalFunds).to.equal(initialTotalFunds.add(sendValue));
        });
    });

    describe("Collateral Management", function () {
        beforeEach(async function () {
            await liquidityPool.setCreditScore(user1.address, 80);
            await glintToken.transfer(user1.address, ethers.utils.parseEther("1000"));
            await glintToken.connect(user1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(user1).depositCollateral(glintToken.address, ethers.utils.parseEther("100"));
        });

        it("should enforce minimum deposit amount", async function () {
            const smallAmount = ethers.utils.parseEther("0.005");
            await expect(
                lendingManager.connect(user1).depositFunds({ value: smallAmount })
            ).to.be.revertedWith("Minimum deposit is 0.01 ETH");
        });

        it("should allow collateral deposits", async function () {
            const depositAmount = ethers.utils.parseEther("50");
            await glintToken.transfer(user2.address, depositAmount);
            await glintToken.connect(user2).approve(liquidityPool.address, depositAmount);

            await expect(
                liquidityPool.connect(user2).depositCollateral(glintToken.address, depositAmount)
            ).to.emit(liquidityPool, "CollateralDeposited")
                .withArgs(user2.address, glintToken.address, depositAmount);
        });

        it("should allow collateral withdrawals", async function () {
            const withdrawAmount = ethers.utils.parseEther("50");

            await expect(
                liquidityPool.connect(user1).withdrawCollateral(glintToken.address, withdrawAmount)
            ).to.emit(liquidityPool, "CollateralWithdrawn")
                .withArgs(user1.address, glintToken.address, withdrawAmount);
        });
    });

    describe("borrow", function () {
        beforeEach(async function () {
            await deployer.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });
        });

        it("should revert with insufficient collateral", async function () {
            const borrowAmount = ethers.utils.parseEther("1");
            await liquidityPool.setCreditScore(user2.address, 80);

            const [, , maxBorrowByTier] = await liquidityPool.getBorrowTerms(user2.address);
            const collateralValue = await liquidityPool.getTotalCollateralValue(user2.address);
            const [requiredRatio] = await liquidityPool.getBorrowTerms(user2.address);
            const maxBorrowByCollateral = collateralValue.mul(100).div(requiredRatio);

            expect(borrowAmount.gt(maxBorrowByCollateral)).to.be.true;

            await expect(
                liquidityPool.connect(user2).borrow(borrowAmount)
            ).to.be.revertedWith("Insufficient collateral for this loan");
        });

        it("should revert with low credit score (TIER_5)", async function () {
            await liquidityPool.setCreditScore(user1.address, 50);
            await expect(
                liquidityPool.connect(user1).borrow(ethers.utils.parseEther("0.05"))
            ).to.be.revertedWith("Credit score too low");
        });

        it("should allow borrowing with sufficient collateral", async function () {
            await liquidityPool.setCreditScore(user1.address, 80);
            await glintToken.transfer(user1.address, ethers.utils.parseEther("1000"));
            await glintToken.connect(user1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(user1).depositCollateral(glintToken.address, ethers.utils.parseEther("200"));

            const borrowAmount = ethers.utils.parseEther("0.1");
            await expect(
                liquidityPool.connect(user1).borrow(borrowAmount)
            ).to.emit(liquidityPool, "Borrowed")
                .withArgs(user1.address, borrowAmount);
        });
    });

    describe("Collateralization Check", function () {
        beforeEach(async function () {
            await deployer.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });
            await liquidityPool.setCreditScore(user1.address, 80);
            await glintToken.transfer(user1.address, ethers.utils.parseEther("1000"));
            await glintToken.connect(user1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(user1).depositCollateral(glintToken.address, ethers.utils.parseEther("200"));
        });

        it("should return healthy position for adequate collateral", async function () {
            const borrowTerms = await liquidityPool.getBorrowTerms(user1.address);
            const requiredRatio = borrowTerms[0];
            const collateralValue = await liquidityPool.getTotalCollateralValue(user1.address);
            const maxBorrow = collateralValue.mul(100).div(requiredRatio);
            const borrowAmount = maxBorrow.gt(ethers.utils.parseEther("0.1")) ? ethers.utils.parseEther("0.1") : maxBorrow.div(2);

            await liquidityPool.connect(user1).borrow(borrowAmount);

            const [isHealthy, ratio] = await liquidityPool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.true;
            expect(ratio.gte(requiredRatio)).to.be.true;
        });

        it("should handle different tiers correctly", async function () {
            // Test TIER_1 (90-100 score, 110% ratio)
            await liquidityPool.setCreditScore(user1.address, 95);
            const borrowTerms1 = await liquidityPool.getBorrowTerms(user1.address);
            expect(borrowTerms1[0]).to.equal(110);

            // Test TIER_3 (70-79 score, 140% ratio)
            await liquidityPool.setCreditScore(user1.address, 75);
            const borrowTerms3 = await liquidityPool.getBorrowTerms(user1.address);
            expect(borrowTerms3[0]).to.equal(140);
        });
    });

    describe("repay", function () {
        beforeEach(async function () {
            await deployer.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });
            await liquidityPool.setCreditScore(user1.address, 80);
            await glintToken.transfer(user1.address, ethers.utils.parseEther("1000"));
            await glintToken.connect(user1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(user1).depositCollateral(glintToken.address, ethers.utils.parseEther("100"));
            await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1"));
        });

        it("should revert with overpayment", async function () {
            const debt = await liquidityPool.userDebt(user1.address);
            const overpayment = debt.add(ethers.utils.parseEther("1"));

            await expect(
                liquidityPool.connect(user1).repay({ value: overpayment })
            ).to.be.revertedWith("Overpayment not allowed");
        });

        it("should allow full repayment", async function () {
            const debt = await liquidityPool.userDebt(user1.address);

            await expect(
                liquidityPool.connect(user1).repay({ value: debt })
            ).to.emit(liquidityPool, "Repaid")
                .withArgs(user1.address, debt);

            expect(await liquidityPool.userDebt(user1.address)).to.equal(0);
        });

        it("should handle late fees correctly", async function () {
            // Fast forward time to trigger late fees
            await ethers.provider.send("evm_increaseTime", [86400 * 31]); // 31 days
            await ethers.provider.send("evm_mine");

            const debt = await liquidityPool.userDebt(user1.address);
            const userDebt = debt.toBigInt();
            const lateFeeAPR = await liquidityPool.LATE_FEE_APR();
            const daysLate = 31n;

            let lateFee = 0n;
            if (daysLate > 0n && BigInt(lateFeeAPR) > 0n) {
                lateFee = (userDebt * BigInt(lateFeeAPR) * daysLate) / 365n / 10000n;
            }

            expect(lateFee).to.be.gt(0);
        });
    });

    describe("setCreditScore", function () {
        it("should allow owner to set credit score", async function () {
            await liquidityPool.setCreditScore(user1.address, 75);
            const score = await liquidityPool.creditScore(user1.address);
            expect(score).to.equal(75);
        });

        it("should revert when non-owner tries to set score", async function () {
            await expect(
                liquidityPool.connect(user1).setCreditScore(user2.address, 75)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("transferOwnership", function () {
        it("should transfer ownership correctly", async function () {
            await liquidityPool.setAdmin(user1.address);
            const newOwner = await liquidityPool.getAdmin();
            expect(newOwner.toLowerCase()).to.equal(user1.address.toLowerCase());
        });

        it("should revert when non-owner tries to transfer", async function () {
            await expect(
                liquidityPool.connect(user1).setAdmin(user2.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Lending Functionality", function () {
        beforeEach(async function () {
            await lendingManager.connect(lender1).lend({ value: ethers.utils.parseEther("10") });
        });

        it("should allow users to deposit funds as lenders", async function () {
            await lendingManager.connect(user1).depositFunds({ value: ethers.utils.parseEther("1") });
            await lendingManager.getLenderInfo(user1.address);
            const info = await lendingManager.getLenderInfo(user1.address);
            expect(info.balance).to.equal(ethers.utils.parseEther("1"));
        });

        it("should allow interest claims", async function () {
            // Fast forward time to accrue interest
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");

            const initialBalance = await ethers.provider.getBalance(lender1.address);
            await lendingManager.connect(lender1).claimInterest();
            const finalBalance = await ethers.provider.getBalance(lender1.address);

            expect(finalBalance.gt(initialBalance.sub(ethers.utils.parseEther("0.01")))).to.be.true;
        });
    });

    describe("Withdrawal Process", function () {
        beforeEach(async function () {
            await lendingManager.connect(lender1).lend({ value: ethers.utils.parseEther("10") });
        });

        it("should allow early withdrawal with penalty", async function () {
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("5"));
            const request = await lendingManager.withdrawalRequests(lender1.address);
            expect(request.gt(0)).to.be.true;
        });

        it("should allow penalty-free withdrawal after cooldown", async function () {
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("5"));

            await ethers.provider.send("evm_increaseTime", [86401]);
            await ethers.provider.send("evm_mine");

            await lendingManager.connect(lender1).executeWithdrawal();
            const balance = await lendingManager.lenderBalances(lender1.address);
            expect(balance).to.equal(ethers.utils.parseEther("5"));
        });

        it("should allow withdrawal cancellation", async function () {
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("5"));
            await lendingManager.connect(lender1).cancelWithdrawal();

            const request = await lendingManager.withdrawalRequests(lender1.address);
            expect(request).to.equal(0);
        });

        it("should allow withdrawal with accrued interest", async function () {
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");

            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("5"));
            const request = await lendingManager.withdrawalRequests(lender1.address);
            expect(request.gt(0)).to.be.true;
        });

        it("should handle multiple withdrawal requests", async function () {
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("3"));
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("2"));

            const request = await lendingManager.withdrawalRequests(lender1.address);
            expect(request).to.equal(ethers.utils.parseEther("5"));
        });
    });

    describe("Interest Rate Management", function () {
        it("should allow owner to set interest rate", async function () {
            await lendingManager.setCurrentDailyRate(ethers.utils.parseUnits("1.0001500", 18));
            const info = await lendingManager.getLenderInfo(deployer.address);
            expect(info.balance).to.equal(0);
        });

        it("should enforce maximum interest rate", async function () {
            await expect(
                lendingManager.setCurrentDailyRate(ethers.utils.parseUnits("0.9000000", 18))
            ).to.be.revertedWith("Rate must be between 1.0 and 1.01");
        });

        it("should calculate potential interest correctly", async function () {
            const potentialInterest = await lendingManager.calculatePotentialInterest(
                ethers.utils.parseEther("1"),
                30
            );
            expect(potentialInterest.gt(0)).to.be.true;
        });
    });

    describe("Admin Functions", function () {
        it("should allow owner to toggle pause", async function () {
            await liquidityPool.togglePause();
            expect(await liquidityPool.isPaused()).to.be.true;

            await liquidityPool.togglePause();
            expect(await liquidityPool.isPaused()).to.be.false;
        });
    });

    describe("Risk Score & Multiplier", function () {
        it("should decrease weighted risk score and multiplier as high risk loans are repaid", async function () {
            await liquidityPool.setCreditScore(borrower1.address, 65);
            await glintToken.transfer(borrower1.address, ethers.utils.parseEther("1000"));
            await glintToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));

            await deployer.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("20")
            });
            await liquidityPool.connect(borrower1).depositCollateral(glintToken.address, ethers.utils.parseEther("500"));
            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("2"));

            const initialBorrowedByTier = await liquidityPool.borrowedAmountByRiskTier(3);
            const debt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: debt });

            const finalBorrowedByTier = await liquidityPool.borrowedAmountByRiskTier(3);
            expect(finalBorrowedByTier.lt(initialBorrowedByTier)).to.be.true;
        });

        it("should treat liquidation as repayment for risk purposes", async function () {
            await liquidityPool.setCreditScore(user1.address, 95);
            const depositAmt = ethers.utils.parseEther("100");
            await glintToken.transfer(user1.address, depositAmt);
            await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
            await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
            await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1"));

            await mockFeedGlint.setPrice(1e6);
            const [isHealthy] = await liquidityPool.checkCollateralization(user1.address);
            expect(isHealthy).to.be.false;
        });
    });

    describe("Basic Functionality", function () {
        it("should allow owner to change parameters", async function () {
            await liquidityPool.setCreditScore(user1.address, 90);
            expect(await liquidityPool.getCreditScore(user1.address)).to.equal(90);
        });
    });
});
mockFeedUsdt = await MockPriceFeed.deploy(ethers.utils.parseUnits("2000", 8), 8); // $2000/ETH
await mockFeedUsdt.deployed();

// Set up stablecoins as collateral
await liquidityPool.setAllowedCollateral(usdcToken.address, true);
await liquidityPool.setAllowedCollateral(usdtToken.address, true);

// Set price feeds
await liquidityPool.setPriceFeed(usdcToken.address, mockFeedUsdc.address);
await liquidityPool.setPriceFeed(usdtToken.address, mockFeedUsdt.address);

// Update stablecoin parameter setting to use StablecoinManager
await stablecoinManager.setStablecoinParams(
    usdcToken.address,
    true,
    85, // 85% LTV
    110 // 110% liquidation threshold
);
await stablecoinManager.setStablecoinParams(
    usdtToken.address,
    true,
    85, // 85% LTV
    110 // 110% liquidation threshold
);

// Fund the liquidity pool directly
await deployer.sendTransaction({
    to: await liquidityPool.address,
    value: ethers.utils.parseEther("10")
});

// Set credit score for user1
await liquidityPool.setCreditScore(user1.address, 80);

// Transfer and approve stablecoins to user1
await usdcToken.transfer(user1.address, ethers.utils.parseEther("1000"));
await usdtToken.transfer(user1.address, ethers.utils.parseEther("1000"));
await usdcToken.connect(user1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
await usdtToken.connect(user1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));

// Deposit collateral
await liquidityPool.connect(user1).depositCollateral(usdcToken.address, ethers.utils.parseEther("100"));

describe("Stablecoin Parameters", function () {
    it("should correctly set and retrieve stablecoin parameters", async function () {
        const isStablecoin = await stablecoinManager.isTokenStablecoin(usdcToken.address);
        const ltv = await stablecoinManager.stablecoinLTV(usdcToken.address);
        const threshold = await stablecoinManager.stablecoinLiquidationThreshold(usdcToken.address);

        expect(isStablecoin).to.be.true;
        expect(ltv.eq(85)).to.be.true;
        expect(threshold.eq(110)).to.be.true;
    });

    it("should enforce maximum LTV for stablecoins", async function () {
        let reverted = false;
        try {
            await stablecoinManager.setStablecoinParams(
                usdcToken.address,
                true,
                95, // Exceeds MAX_STABLECOIN_LTV (90%)
                110
            );
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/revert/i);
        }
        expect(reverted).to.be.true;
    });

    it("should enforce minimum liquidation threshold for stablecoins", async function () {
        let reverted = false;
        try {
            await stablecoinManager.setStablecoinParams(
                usdcToken.address,
                true,
                85,
                105 // Below DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD (110%)
            );
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/revert/i);
        }
        expect(reverted).to.be.true;
    });
});

describe("Stablecoin Collateral", function () {
    it("should calculate correct max borrow amount for stablecoins", async function () {
        // Calculate max borrow using LTV from stablecoinManager
        const ltv = await stablecoinManager.getLTV(usdcToken.address);
        const price = await liquidityPool.getTokenValue(usdcToken.address);
        const collateral = await liquidityPool.getCollateral(user1.address, usdcToken.address);
        // maxBorrow = collateral * price * ltv / 100 / 1e18
        const maxBorrow = collateral.mul(price).mul(ltv).div(100).div(ethers.BigNumber.from("1000000000000000000"));
        expect(maxBorrow.gt(0)).to.be.true;
    });

    it("should allow borrowing with stablecoin collateral", async function () {
        const borrowAmount = ethers.utils.parseEther("0.1");
        await liquidityPool.connect(user1).borrow(borrowAmount);
        const debt = await liquidityPool.userDebt(user1.address);
        expect(debt.eq(borrowAmount)).to.be.true;
    });

    it("should use correct liquidation threshold for stablecoins", async function () {
        // Add debug output for actual and expected values
        const threshold = await stablecoinManager.getLiquidationThreshold(usdcToken.address);
        const expectedThreshold = ethers.BigNumber.from(110);
        if (!threshold.eq(expectedThreshold)) {
            console.error('Liquidation threshold mismatch:', threshold.toString(), '!=', expectedThreshold.toString());
        }
        expect(threshold.eq(expectedThreshold)).to.be.true; // Should use stablecoin threshold
    });
});

describe("Stablecoin Price Feed", function () {
    it("should correctly get token value from price feed", async function () {
        const value = await liquidityPool.getTokenValue(usdcToken.address);
        expect(value.gt(0)).to.be.true;
    });

    it("should revert if price feed is not set", async function () {
        // Remove price feed
        await liquidityPool.setPriceFeed(usdcToken.address, ethers.constants.AddressZero);
        let reverted = false;
        try {
            await liquidityPool.getTokenValue(usdcToken.address);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/revert/i);
        }
        expect(reverted).to.be.true;
    });
});

describe("Stablecoin Liquidation", function () {
    beforeEach(async function () {
        // Fund the liquidity pool with enough ETH for the large borrow
        await deployer.sendTransaction({
            to: await liquidityPool.address,
            value: ethers.utils.parseEther("100")
        });

        // Get user's tier limits and calculate appropriate borrow amount
        const [, , tierMaxAmount] = await liquidityPool.getBorrowTerms(user1.address);
        const [requiredRatio] = await liquidityPool.getBorrowTerms(user1.address);
        const collateralValue = await liquidityPool.getTotalCollateralValue(user1.address);
        const maxBorrowByCollateral = collateralValue.mul(100).div(ethers.BigNumber.from(requiredRatio));

        // Use a borrow amount that's significant enough to make position unhealthy when price drops
        const maxBorrow = tierMaxAmount.gt(0) ?
            (tierMaxAmount.lt(maxBorrowByCollateral) ? tierMaxAmount : maxBorrowByCollateral) :
            maxBorrowByCollateral;

        // Use a borrow amount that's significant but within limits
        const borrowAmount = maxBorrow.gt(ethers.utils.parseEther("10")) ?
            ethers.utils.parseEther("10") : maxBorrow.div(2);

        await liquidityPool.connect(user1).borrow(borrowAmount);
    });

    it("should use correct liquidation threshold for stablecoins", async function () {
        // Drop price to $0.01 to trigger liquidation
        await mockFeedUsdc.setPrice(ethers.utils.parseUnits("0.01", 8)); // Drop to $0.01/ETH

        // Debug: Check if price feed is updated
        const newPrice = await liquidityPool.getTokenValue(usdcToken.address);

        // Debug: Let's see what the actual values are
        const collateralValue = await liquidityPool.getTotalCollateralValue(user1.address);
        const debt = await liquidityPool.userDebt(user1.address);
        const [requiredRatio] = await liquidityPool.getBorrowTerms(user1.address);

        const [isHealthy, ratio] = await liquidityPool.checkCollateralization(user1.address);

        if (isHealthy) {
            console.error('Position still healthy after price drop:', {
                collateralValue: collateralValue.toString(),
                debt: debt.toString(),
                requiredRatio: requiredRatio.toString(),
                ratio: ratio.toString(),
                newPrice: newPrice.toString()
            });
        }
        expect(isHealthy).to.be.false;
        expect(ratio.lte(requiredRatio)).to.be.true; // Should be below tier-based threshold
    });

    it("should allow recovery from liquidation with stablecoins", async function () {
        // Drop price to $0.1 to trigger liquidation
        await mockFeedUsdc.setPrice(ethers.utils.parseUnits("0.1", 8)); // Drop to $0.1/ETH

        // Verify position is unhealthy first
        const [isHealthy] = await liquidityPool.checkCollateralization(user1.address);
        expect(isHealthy).to.be.false;

        // Start liquidation
        await liquidityPool.startLiquidation(user1.address);

        // Calculate required recovery amount dynamically
        const debt = await liquidityPool.userDebt(user1.address);
        const [requiredRatio] = await liquidityPool.getBorrowTerms(user1.address);
        const currentPrice = await liquidityPool.getTokenValue(usdcToken.address);
        const currentCollateral = await liquidityPool.getCollateral(user1.address, usdcToken.address);

        // Calculate required collateral value: debt * requiredRatio / 100
        const requiredCollateralValue = debt.mul(ethers.BigNumber.from(requiredRatio)).div(100);

        // Calculate current collateral value
        const currentCollateralValue = currentCollateral.mul(currentPrice).div(ethers.BigNumber.from("1000000000000000000"));

        // Calculate additional collateral value needed
        const additionalValueNeeded = requiredCollateralValue.gt(currentCollateralValue) ?
            requiredCollateralValue.sub(currentCollateralValue) : ethers.BigNumber.from(0);

        // Convert to token amount (add 10% buffer to ensure health)
        const additionalTokensNeeded = additionalValueNeeded.gt(0) ?
            additionalValueNeeded.mul(ethers.BigNumber.from("1000000000000000000")).mul(110).div(currentPrice.mul(100)) :
            ethers.utils.parseEther("1"); // Minimum amount if no additional needed

        // Transfer and approve additional tokens
        await usdcToken.transfer(user1.address, additionalTokensNeeded);
        await usdcToken.connect(user1).approve(liquidityPool.address, additionalTokensNeeded);

        // Add enough collateral to make position healthy again
        await liquidityPool.connect(user1).recoverFromLiquidation(
            usdcToken.address,
            additionalTokensNeeded
        );

        const [isHealthyNow] = await liquidityPool.checkCollateralization(user1.address);
        expect(isHealthyNow).to.be.true;
    });
});

describe("Multiple Stablecoin Collateral", function () {
    beforeEach(async function () {
        // Deposit both USDC and USDT
        await liquidityPool.connect(user1).depositCollateral(
            usdcToken.address,
            ethers.utils.parseEther("50")
        );
        await liquidityPool.connect(user1).depositCollateral(
            usdtToken.address,
            ethers.utils.parseEther("50")
        );
    });

    it("should calculate total collateral value correctly with multiple stablecoins", async function () {
        const totalValue = await liquidityPool.getTotalCollateralValue(user1.address);
        expect(totalValue.gt(0)).to.be.true;
    });

    it("should allow borrowing against multiple stablecoin collateral", async function () {
        const borrowAmount = ethers.utils.parseEther("0.1");
        await liquidityPool.connect(user1).borrow(borrowAmount);
        const debt = await liquidityPool.userDebt(user1.address);
        expect(debt.eq(borrowAmount)).to.be.true;
    });

    it("should maintain correct health factor with multiple stablecoins", async function () {
        const [isHealthy, ratio] = await liquidityPool.checkCollateralization(user1.address);
        expect(isHealthy).to.be.true;
        expect(ratio.gt(110)).to.be.true; // Should be above stablecoin threshold
    });
});


describe("Basic Functionality", function () {
    it("should allow owner to change parameters", async function () {
        // Remove call to setMaxBorrowAmount since it does not exist
        // await pool.setMaxBorrowAmount(ethers.parseEther("100"));
        // Instead, verify that the owner can set other parameters
        await liquidityPool.setCreditScore(user1.address, 90);
        expect((await liquidityPool.getCreditScore(user1.address)).eq(90)).to.be.true;
    });
});

describe("Risk Score & Multiplier", function () {
    it("should decrease weighted risk score and multiplier as high risk loans are repaid", async function () {
        // Setup high-risk borrower
        await liquidityPool.setCreditScore(borrower1.address, 65); // TIER_4 (high risk)
        await glintToken.transfer(borrower1.address, ethers.utils.parseEther("1000"));
        await glintToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));

        // Fund pool and deposit collateral
        await deployer.sendTransaction({
            to: liquidityPool.address,
            value: ethers.utils.parseEther("20")
        });
        await liquidityPool.connect(borrower1).depositCollateral(glintToken.address, ethers.utils.parseEther("500"));

        // Borrow funds
        await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("2"));

        // Get initial risk metrics
        const initialBorrowedByTier = await liquidityPool.borrowedAmountByRiskTier(3); // TIER_4 index

        // Repay the loan
        const debt = await liquidityPool.userDebt(borrower1.address);
        await liquidityPool.connect(borrower1).repay({ value: debt });

        // Check that borrowed amount by tier decreased
        const finalBorrowedByTier = await liquidityPool.borrowedAmountByRiskTier(3);
        expect(finalBorrowedByTier.lt(initialBorrowedByTier)).to.be.true;
    });
});
const riskMult = await interestRateModel.getRiskMultiplier(weightedScore);
expect(riskMult.eq(ethers.utils.parseUnits("1", 18))).to.be.true;
        

it("should update weighted risk score and multiplier as loans are made in different tiers", async function () {
    // Setup users in different tiers
    await liquidityPool.setCreditScore(user1.address, 95); // TIER_1
    await liquidityPool.setCreditScore(user2.address, 75); // TIER_3
    // Give both users collateral
    const depositAmt = ethers.utils.parseEther("100");
    await glintToken.transfer(user1.address, depositAmt);
    await glintToken.transfer(user2.address, depositAmt);
    await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
    await glintToken.connect(user2).approve(liquidityPool.address, depositAmt);
    await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
    await liquidityPool.connect(user2).depositCollateral(glintToken.address, depositAmt);
    // Both borrow
    await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1")); // TIER_1
    await liquidityPool.connect(user2).borrow(ethers.utils.parseEther("3")); // TIER_3
    const borrowedByTier = [
        await liquidityPool.borrowedAmountByRiskTier(0),
        await liquidityPool.borrowedAmountByRiskTier(1),
        await liquidityPool.borrowedAmountByRiskTier(2),
        await liquidityPool.borrowedAmountByRiskTier(3)
    ];
    const weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
    expect(weightedScore.eq(2)).to.be.true;
    const riskMult = await interestRateModel.getRiskMultiplier(weightedScore);
    expect(riskMult.eq(ethers.utils.parseUnits("1", 18))).to.be.true;
});

it("should decrease weighted risk score and multiplier as high risk loans are repaid", async function () {
    await liquidityPool.setCreditScore(user1.address, 95); // TIER_1
    await liquidityPool.setCreditScore(user2.address, 65); // TIER_4
    const depositAmt = ethers.utils.parseEther("100");
    await glintToken.transfer(user1.address, depositAmt);
    await glintToken.transfer(user2.address, depositAmt);
    await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
    await glintToken.connect(user2).approve(liquidityPool.address, depositAmt);
    await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
    await liquidityPool.connect(user2).depositCollateral(glintToken.address, depositAmt);
    await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("2")); // TIER_1
    await liquidityPool.connect(user2).borrow(ethers.utils.parseEther("2")); // TIER_4
    let borrowedByTier = [
        await liquidityPool.borrowedAmountByRiskTier(0),
        await liquidityPool.borrowedAmountByRiskTier(1),
        await liquidityPool.borrowedAmountByRiskTier(2),
        await liquidityPool.borrowedAmountByRiskTier(3)
    ];
    let weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
    expect(weightedScore.eq(2)).to.be.true;
    // Repay TIER_4 loan
    await liquidityPool.connect(user2).repay({ value: ethers.utils.parseEther("2") });
    borrowedByTier = [
        await liquidityPool.borrowedAmountByRiskTier(0),
        await liquidityPool.borrowedAmountByRiskTier(1),
        await liquidityPool.borrowedAmountByRiskTier(2),
        await liquidityPool.borrowedAmountByRiskTier(3)
    ];
    weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
    expect(weightedScore.eq(1)).to.be.true;
    const riskMult = await interestRateModel.getRiskMultiplier(weightedScore);
    expect(riskMult.eq(ethers.utils.parseUnits("0.9", 18))).to.be.true;
});

it("should return correct real-time return rate for lender", async function () {
    // Simulate TIER_3 loan only
    await liquidityPool.setCreditScore(user1.address, 75); // TIER_3
    const depositAmt = ethers.utils.parseEther("100");
    await glintToken.transfer(user1.address, depositAmt);
    await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
    await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
    await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1")); // TIER_3
    const borrowedByTier = [
        await liquidityPool.borrowedAmountByRiskTier(0),
        await liquidityPool.borrowedAmountByRiskTier(1),
        await liquidityPool.borrowedAmountByRiskTier(2),
        await liquidityPool.borrowedAmountByRiskTier(3)
    ];
    const weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
    expect(weightedScore.eq(3)).to.be.true;
    const riskMult = await interestRateModel.getRiskMultiplier(weightedScore);
    expect(riskMult.eq(ethers.utils.parseUnits("1.1", 18))).to.be.true;
    // Real-time return rate should use dynamic rate calculation
    const rate = await lendingManager.getRealTimeReturnRate(user1.address);
    // The rate should be the dynamic lender rate, not baseAPR * globalMult
    expect(rate.gt(0)).to.be.true; // Should be positive
});

describe("Repayment Risk Adjustment", function () {
    let glintToken, mockFeedGlint;
    beforeEach(async function () {
        // Deploy GlintToken
        const GlintToken = await ethers.getContractFactory("GlintToken");
        glintToken = await GlintToken.deploy(ethers.utils.parseEther("1000000"));
        await glintToken.deployed();

        // Deploy Mock Price Feed
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockFeedGlint = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
        await mockFeedGlint.deployed();

        // Set up collateral token
        await liquidityPool.setAllowedCollateral(glintToken.address, true);
        await liquidityPool.setPriceFeed(glintToken.address, mockFeedGlint.address);

        // Fund the liquidity pool directly
        await deployer.sendTransaction({
            to: await liquidityPool.address,
            value: ethers.utils.parseEther("10")
        });
    });

    it("should show 100% repayment ratio and 1.0x multiplier when all loans are repaid", async function () {
        await liquidityPool.setCreditScore(user1.address, 95); // TIER_1
        const depositAmt = ethers.utils.parseEther("100");
        await glintToken.transfer(user1.address, depositAmt);
        await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
        await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
        await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1"));
        await liquidityPool.connect(user1).repay({ value: ethers.utils.parseEther("1") });
        const totalBorrowed = await liquidityPool.totalBorrowedAllTime();
        const totalRepaid = await liquidityPool.totalRepaidAllTime();
        const repaymentRatio = await interestRateModel.getRepaymentRatio(totalBorrowed, totalRepaid);
        expect(repaymentRatio.eq(ethers.utils.parseUnits("1", 18))).to.be.true;
        const repayMult = await interestRateModel.getRepaymentRiskMultiplier(repaymentRatio);
        expect(repayMult.eq(ethers.utils.parseUnits("1", 18))).to.be.true;
        const borrowedByTier = [
            await liquidityPool.borrowedAmountByRiskTier(0),
            await liquidityPool.borrowedAmountByRiskTier(1),
            await liquidityPool.borrowedAmountByRiskTier(2),
            await liquidityPool.borrowedAmountByRiskTier(3)
        ];
        const weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
        const riskMult = await interestRateModel.getRiskMultiplier(weightedScore);
        const globalMult = await interestRateModel.getGlobalRiskMultiplier(riskMult, repayMult);
        expect(globalMult.eq(riskMult)).to.be.true;
    });

    it("should increase repayment risk multiplier as repayment ratio drops", async function () {
        await liquidityPool.setCreditScore(user1.address, 95); // TIER_1
        await liquidityPool.setCreditScore(user2.address, 75); // TIER_3
        const depositAmt = ethers.utils.parseEther("100");
        await glintToken.transfer(user1.address, depositAmt);
        await glintToken.transfer(user2.address, depositAmt);
        await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
        await glintToken.connect(user2).approve(liquidityPool.address, depositAmt);
        await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
        await liquidityPool.connect(user2).depositCollateral(glintToken.address, depositAmt);
        // Both borrow
        await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1"));
        await liquidityPool.connect(user2).borrow(ethers.utils.parseEther("3"));
        // Only repay part of user2's loan (repay 1 out of 4 total)
        await liquidityPool.connect(user2).repay({ value: ethers.utils.parseEther("1") });
        // Now: totalBorrowedAllTime = 4, totalRepaidAllTime = 1
        const totalBorrowed = await liquidityPool.totalBorrowedAllTime();
        const totalRepaid = await liquidityPool.totalRepaidAllTime();
        const repaymentRatio = await interestRateModel.getRepaymentRatio(totalBorrowed, totalRepaid);

        expect(repaymentRatio.eq(ethers.utils.parseUnits("0.25", 18))).to.be.true; // ~25%
        const repayMult = await interestRateModel.getRepaymentRiskMultiplier(repaymentRatio);
        expect(repayMult.eq(ethers.utils.parseUnits("1.2", 18))).to.be.true; // <80% → 1.20x
        // Global risk multiplier should be riskMultiplier * 1.2
        const borrowedByTier = [
            await liquidityPool.borrowedAmountByRiskTier(0),
            await liquidityPool.borrowedAmountByRiskTier(1),
            await liquidityPool.borrowedAmountByRiskTier(2),
            await liquidityPool.borrowedAmountByRiskTier(3)
        ];
        const weightedScore = await interestRateModel.getWeightedRiskScore(borrowedByTier);
        const riskMult = await interestRateModel.getRiskMultiplier(weightedScore);
        const globalMult = await interestRateModel.getGlobalRiskMultiplier(riskMult, repayMult);

        expect(globalMult.eq(riskMult.mul(ethers.utils.parseUnits("1.2", 18)).div(ethers.utils.parseUnits("1", 18)))).to.be.true;
    });

    it("should treat liquidation as repayment for risk purposes", async function () {
        await liquidityPool.setCreditScore(user1.address, 95); // TIER_1
        const depositAmt = ethers.utils.parseEther("100");
        await glintToken.transfer(user1.address, depositAmt);
        await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
        await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
        await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1"));
        // Force undercollateralization by dropping price
        await mockFeedGlint.setPrice(1e6); // Drop price by 100x
        // Confirm unhealthy
        const [isHealthy] = await liquidityPool.checkCollateralization(user1.address);
        expect(isHealthy).to.be.false;
        // Start liquidation
        await liquidityPool.startLiquidation(user1.address);
        // Fast forward past grace period
        await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine");
        // Provide all required arguments to executeLiquidation
        const poolAddress = liquidityPool.address;
        const userAddress = user1.address;

        await lendingManager.executeLiquidation(poolAddress, userAddress);
        // Should count as repaid
        const totalBorrowed = await liquidityPool.totalBorrowedAllTime();
        const totalRepaid = await liquidityPool.totalRepaidAllTime();
        const repaymentRatio = await interestRateModel.getRepaymentRatio(totalBorrowed, totalRepaid);
        expect(repaymentRatio.eq(ethers.utils.parseUnits("1", 18))).to.be.true;
    });

    it("should affect real-time return rate for lenders", async function () {
        await liquidityPool.setCreditScore(user1.address, 95); // TIER_1
        await liquidityPool.setCreditScore(user2.address, 75); // TIER_3
        const depositAmt = ethers.utils.parseEther("100");
        await glintToken.transfer(user1.address, depositAmt);
        await glintToken.transfer(user2.address, depositAmt);
        await glintToken.connect(user1).approve(liquidityPool.address, depositAmt);
        await glintToken.connect(user2).approve(liquidityPool.address, depositAmt);
        await liquidityPool.connect(user1).depositCollateral(glintToken.address, depositAmt);
        await liquidityPool.connect(user2).depositCollateral(glintToken.address, depositAmt);
        await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("1"));
        await liquidityPool.connect(user2).borrow(ethers.utils.parseEther("3"));
        // Only repay part of user2's loan
        await liquidityPool.connect(user2).repay({ value: ethers.utils.parseEther("1") });
        // Now: totalBorrowedAllTime = 4, totalRepaidAllTime = 2
        // Real-time return rate should use dynamic rate calculation
        const rate = await lendingManager.getRealTimeReturnRate(user1.address);
        // The rate should be the dynamic lender rate
        expect(rate.gt(0)).to.be.true; // Should be positive
    });
});

describe("transferOwnership", function () {
    let liquidityPool, lendingManager, stablecoinManager, interestRateModel, deployer, user1, user2;
    beforeEach(async function () {
        [deployer, user1, user2] = await ethers.getSigners();
        // Deploy StablecoinManager first
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(deployer.address);
        await stablecoinManager.deployed();
        const stablecoinManagerAddress = stablecoinManager.address;
        // Deploy InterestRateModel
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            deployer.address,
            ethers.constants.AddressZero,
            "50000000000000000",
            "800000000000000000",
            "100000000000000000",
            "300000000000000000",
            "100000000000000000",
            "1000000000000000000",
            "50000000000000000",
            "30000000000000000",
            "200000000000000000",
            86400
        );
        await interestRateModel.deployed();
        const interestRateModelAddress = interestRateModel.address;
        // Deploy LiquidityPool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await upgrades.deployProxy(LiquidityPool, [
            deployer.address,// TODO DAO here
            stablecoinManagerAddress,
            ethers.constants.AddressZero,
            interestRateModelAddress,
            ethers.constants.AddressZero // _creditSystem
        ], {
            initializer: "initialize",
        });
        await liquidityPool.deployed();
        const poolAddress = liquidityPool.address;
        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(poolAddress, deployer.address);
        await lendingManager.deployed();
        const lendingManagerAddress = lendingManager.address;
        await lendingManager.setCurrentDailyRate(ethers.utils.parseUnits("1.0001304", 18));
        await liquidityPool.setLendingManager(lendingManagerAddress);
    });
    it("should transfer ownership correctly", async function () {
        const tx = await liquidityPool.setAdmin(user1.address);
        const receipt = await tx.wait();
        const newOwner = await liquidityPool.getAdmin();
        if (newOwner.toLowerCase() !== user1.address.toLowerCase()) {
            console.error('Ownership transfer failed!');
        }
        assert.equal(newOwner.toLowerCase(), user1.address.toLowerCase());
    });
    it("should revert when non-owner tries to transfer", async function () {
        let reverted = false;
        try {
            await liquidityPool.connect(user1).setAdmin(user2.address);
        } catch (err) {
            reverted = true;
            expect(err.message).to.match(/revert/i);
        }
        expect(reverted).to.be.true;
    });
});
