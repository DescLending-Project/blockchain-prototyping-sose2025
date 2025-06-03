const { assert, expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config.js");

describe("LiquidityPoolV3 - Basic Tests", function () {
    let liquidityPool, deployer, user1, user2;
    const sendValue = ethers.parseEther("0.1"); // 0.1 ETH for testing

    beforeEach(async function () {
        [deployer, user1, user2] = await ethers.getSigners();
        const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
        liquidityPool = await upgrades.deployProxy(LiquidityPoolV3, [deployer.address], {
            initializer: "initialize",
        });
        await liquidityPool.waitForDeployment();
    });

    describe("Deployment", function () {
        it("should set the right owner", async function () {
            expect(await liquidityPool.getAdmin()).to.equal(deployer.address);
        });

        it("should have 0 totalFunds initially", async function () {
            expect(await liquidityPool.totalFunds()).to.equal(0n);
        });

        it("should initialize with correct default values", async function () {
            expect(await liquidityPool.interestRate()).to.equal(5); // 5%
            expect(await liquidityPool.EARLY_WITHDRAWAL_PENALTY()).to.equal(5); // 5%
            expect(await liquidityPool.WITHDRAWAL_COOLDOWN()).to.equal(86400); // 1 day
        });
    });

    describe("receive", function () {
        it("should increase totalFunds when receiving ETH", async function () {
            const initialTotalFunds = await liquidityPool.totalFunds();
            await user1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: sendValue
            });
            const newTotalFunds = await liquidityPool.totalFunds();
            assert.equal(
                newTotalFunds.toString(),
                (initialTotalFunds + sendValue).toString()
            );
        });
    });

    describe("extract", function () {
        beforeEach(async function () {
            // Fund pool for extraction
            await deployer.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: sendValue
            });
        });

        it("should allow owner to extract funds", async function () {
            const initialOwnerBalance = await ethers.provider.getBalance(deployer.address);
            const gasPrice = await ethers.provider.getFeeData();
            const tx = await liquidityPool.extract(sendValue);
            const receipt = await tx.wait();
            const gasUsed = BigInt(receipt.gasUsed);
            const gasCost = gasUsed * BigInt(gasPrice.gasPrice);
            const newOwnerBalance = await ethers.provider.getBalance(deployer.address);

            // Calculate expected balance: initial + extracted - gas cost
            const expectedBalance = initialOwnerBalance + sendValue - gasCost;

            // Allow for a small difference due to gas price fluctuations
            const difference = expectedBalance > newOwnerBalance
                ? expectedBalance - newOwnerBalance
                : newOwnerBalance - expectedBalance;

            // Allow for a small difference (up to 0.0001 ETH)
            assert.isTrue(difference <= ethers.parseEther("0.0001"),
                `Balance difference too large: ${ethers.formatEther(difference)} ETH`);
        });

        it("should revert if non-owner tries to extract", async function () {
            await expect(
                liquidityPool.connect(user1).extract(sendValue)
            ).to.be.revertedWithCustomError(liquidityPool, "OwnableUnauthorizedAccount");
        });

        it("should revert if trying to extract more than balance", async function () {
            await expect(
                liquidityPool.extract(ethers.parseEther("2"))
            ).to.be.revertedWith("Insufficient contract balance");
        });
    });

    describe("borrow", function () {
        let glintToken;
        let mockFeedGlint;

        beforeEach(async function () {
            // Deploy GlintToken
            const GlintToken = await ethers.getContractFactory("GlintToken");
            const initialSupply = ethers.parseEther("100");
            glintToken = await GlintToken.deploy(initialSupply);
            await glintToken.waitForDeployment();

            // Deploy Mock Price Feed
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockFeedGlint = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
            await mockFeedGlint.waitForDeployment();

            // Set up collateral token
            await liquidityPool.setAllowedCollateral(glintToken.target, true);
            await liquidityPool.setPriceFeed(glintToken.target, mockFeedGlint.target);

            // Fund pool and set up lending
            await deployer.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("1") // Send 1 ETH to ensure enough funds
            });
            // Deposit as lender to set up totalLent
            await liquidityPool.connect(deployer).depositFunds({ value: ethers.parseEther("1") });

            // Set credit score
            await liquidityPool.setCreditScore(user1.address, 80);

            // Transfer and approve Glint tokens to user1
            await glintToken.transfer(user1.address, ethers.parseEther("10"));
            await glintToken.connect(user1).approve(liquidityPool.target, ethers.parseEther("10"));

            // Deposit collateral
            await liquidityPool.connect(user1).depositCollateral(glintToken.target, ethers.parseEther("5"));
        });

        it("should allow borrowing with sufficient credit score", async function () {
            const borrowAmount = ethers.parseEther("0.1");
            const tx = await liquidityPool.connect(user1).borrow(borrowAmount);
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "Borrowed");
            // Only check address and amount, not timestamp
            expect(event.args[0]).to.equal(user1.address);
            expect(event.args[1]).to.equal(borrowAmount);
            const userDebt = await liquidityPool.userDebt(user1.address);
            assert.equal(userDebt.toString(), borrowAmount.toString());
        });

        it("should revert with low credit score", async function () {
            await liquidityPool.setCreditScore(user1.address, 50);
            await expect(
                liquidityPool.connect(user1).borrow(ethers.parseEther("0.1"))
            ).to.be.revertedWith("Credit score too low");
        });

        it("should revert when borrowing more than half of pool", async function () {
            // Try to borrow more than half of totalLent
            await expect(
                liquidityPool.connect(user1).borrow(ethers.parseEther("0.6"))
            ).to.be.revertedWith("Borrow amount exceeds available lending capacity");
        });

        it("should revert with insufficient collateral", async function () {
            // First ensure we have enough lending capacity
            await liquidityPool.connect(deployer).depositFunds({ value: ethers.parseEther("10") });

            // Try to borrow more than what our collateral covers
            // With 5 ETH collateral and DEFAULT_LIQUIDATION_THRESHOLD of 130,
            // we can only borrow up to ~3.85 ETH (5 * 100 / 130)
            await expect(
                liquidityPool.connect(user1).borrow(ethers.parseEther("4"))
            ).to.be.revertedWith("Insufficient collateral for this loan");
        });
    });

    describe("repay", function () {
        let glintToken;
        let mockFeedGlint;

        beforeEach(async function () {
            // Deploy GlintToken
            const GlintToken = await ethers.getContractFactory("GlintToken");
            const initialSupply = ethers.parseEther("100");
            glintToken = await GlintToken.deploy(initialSupply);
            await glintToken.waitForDeployment();

            // Deploy Mock Price Feed
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockFeedGlint = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
            await mockFeedGlint.waitForDeployment();

            // Set up collateral token
            await liquidityPool.setAllowedCollateral(glintToken.target, true);
            await liquidityPool.setPriceFeed(glintToken.target, mockFeedGlint.target);

            // Fund pool and set up lending
            await deployer.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("1") // Send 1 ETH to ensure enough funds
            });
            // Deposit as lender to set up totalLent
            await liquidityPool.connect(deployer).depositFunds({ value: ethers.parseEther("1") });

            // Set credit score
            await liquidityPool.setCreditScore(user1.address, 80);

            // Transfer and approve Glint tokens to user1
            await glintToken.transfer(user1.address, ethers.parseEther("10"));
            await glintToken.connect(user1).approve(liquidityPool.target, ethers.parseEther("10"));

            // Deposit collateral
            await liquidityPool.connect(user1).depositCollateral(glintToken.target, ethers.parseEther("5"));

            // Borrow funds
            const borrowAmount = ethers.parseEther("0.1");
            await liquidityPool.connect(user1).borrow(borrowAmount);
        });

        it("should allow partial repayment", async function () {
            const repayAmount = ethers.parseEther("0.05");
            const initialDebt = await liquidityPool.userDebt(user1.address);

            const tx = await liquidityPool.connect(user1).repay({ value: repayAmount });
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "Repaid");

            expect(event.args[0]).to.equal(user1.address);
            expect(event.args[1]).to.equal(repayAmount);

            const remainingDebt = await liquidityPool.userDebt(user1.address);
            assert.equal(
                remainingDebt.toString(),
                (initialDebt - repayAmount).toString()
            );
        });

        it("should allow full repayment", async function () {
            const debt = await liquidityPool.userDebt(user1.address);
            const interestOwed = await liquidityPool.calculateInterest(user1.address);
            const totalOwed = debt + interestOwed;

            const tx = await liquidityPool.connect(user1).repay({ value: totalOwed });
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "Repaid");
            expect(event.args[0]).to.equal(user1.address);
            expect(event.args[1]).to.equal(totalOwed);
            const remainingDebt = await liquidityPool.userDebt(user1.address);
            assert.equal(remainingDebt.toString(), "0");
        });

        it("should revert with zero repayment", async function () {
            await expect(
                liquidityPool.connect(user1).repay({ value: 0 })
            ).to.be.revertedWith("Must send funds to repay");
        });

        it("should revert with no debt", async function () {
            // First repay the debt
            const debt = await liquidityPool.userDebt(user1.address);
            const interestOwed = await liquidityPool.calculateInterest(user1.address);
            await liquidityPool.connect(user1).repay({ value: debt + interestOwed });

            // Try to repay again
            await expect(
                liquidityPool.connect(user1).repay({ value: ethers.parseEther("0.1") })
            ).to.be.revertedWith("No outstanding debt");
        });

        it("should revert with overpayment", async function () {
            const debt = await liquidityPool.userDebt(user1.address);
            const interestOwed = await liquidityPool.calculateInterest(user1.address);
            const totalOwed = debt + interestOwed;

            await expect(
                liquidityPool.connect(user1).repay({ value: totalOwed + ethers.parseEther("0.1") })
            ).to.be.revertedWith("Repayment exceeds total debt");
        });
    });

    describe("setCreditScore", function () {
        it("should allow owner to set credit score", async function () {
            await liquidityPool.setCreditScore(user1.address, 75);
            const score = await liquidityPool.creditScore(user1.address);
            assert.equal(score, 75);
        });

        it("should revert when non-owner tries to set score", async function () {
            await expect(
                liquidityPool.connect(user1).setCreditScore(user2.address, 75)
            ).to.be.revertedWithCustomError(liquidityPool, "OwnableUnauthorizedAccount");
        });
    });

    describe("transferOwnership", function () {
        it("should transfer ownership correctly", async function () {
            await liquidityPool.setAdmin(user1.address);
            const newOwner = await liquidityPool.getAdmin();
            assert.equal(newOwner, user1.address);
        });

        it("should revert when non-owner tries to transfer", async function () {
            await expect(
                liquidityPool.connect(user1).setAdmin(user2.address)
            ).to.be.revertedWithCustomError(liquidityPool, "OwnableUnauthorizedAccount");
        });
    });

    describe("Lending Functionality", function () {
        it("should allow users to deposit funds as lenders", async function () {
            const tx = await liquidityPool.connect(user1).depositFunds({ value: sendValue });
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "FundsDeposited");

            expect(event.args[0]).to.equal(user1.address);
            expect(event.args[1]).to.equal(sendValue);

            const info = await liquidityPool.getLenderInfo(user1.address);
            expect(info.balance).to.equal(sendValue);
        });

        it("should enforce minimum deposit amount", async function () {
            await expect(
                liquidityPool.connect(user1).depositFunds({ value: ethers.parseEther("0.001") })
            ).to.be.revertedWith("Deposit amount too low");
        });

        it("should enforce maximum deposit amount", async function () {
            await expect(
                liquidityPool.connect(user1).depositFunds({ value: ethers.parseEther("101") })
            ).to.be.revertedWith("Deposit would exceed maximum limit");
        });

        it("should accrue interest for lenders", async function () {
            await liquidityPool.connect(user1).depositFunds({ value: sendValue });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            const info = await liquidityPool.getLenderInfo(user1.address);
            expect(info.pendingInterest).to.be.gt(0);
        });

        it("should allow interest claims", async function () {
            await liquidityPool.connect(user1).depositFunds({ value: sendValue });

            // Fast forward 30 days
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine", []);

            const tx = await liquidityPool.connect(user1).claimInterest();
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "InterestClaimed");

            expect(event.args[0]).to.equal(user1.address);
        });
    });

    describe("Withdrawal Process", function () {
        beforeEach(async function () {
            await liquidityPool.connect(user1).depositFunds({ value: sendValue });
        });

        it("should allow early withdrawal with penalty", async function () {
            // Request withdrawal
            await liquidityPool.connect(user1).requestWithdrawal(ethers.parseEther("0.05"));

            // Complete withdrawal immediately (before cooldown)
            const tx = await liquidityPool.connect(user1).completeWithdrawal();
            const receipt = await tx.wait();

            // Check for EarlyWithdrawalPenalty event
            const penaltyEvent = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "EarlyWithdrawalPenalty");

            expect(penaltyEvent).to.not.be.null;
            expect(penaltyEvent.args[0]).to.equal(user1.address);

            // Check for FundsWithdrawn event
            const withdrawEvent = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "FundsWithdrawn");

            expect(withdrawEvent).to.not.be.null;
            expect(withdrawEvent.args[0]).to.equal(user1.address);

            // Verify the withdrawal was processed
            const info = await liquidityPool.getLenderInfo(user1.address);
            expect(info.balance).to.be.lt(ethers.parseEther("0.1")); // Balance should be reduced
        });

        it("should allow penalty-free withdrawal after cooldown", async function () {
            // Request withdrawal
            await liquidityPool.connect(user1).requestWithdrawal(ethers.parseEther("0.05"));

            // Fast forward cooldown period
            await ethers.provider.send("evm_increaseTime", [86400 + 1]); // 24 hours + 1 second
            await ethers.provider.send("evm_mine", []);

            // Complete withdrawal after cooldown
            const tx = await liquidityPool.connect(user1).completeWithdrawal();
            const receipt = await tx.wait();

            // Should not have EarlyWithdrawalPenalty event
            const penaltyEvent = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "EarlyWithdrawalPenalty");
            expect(penaltyEvent).to.be.undefined;

            // Should have FundsWithdrawn event
            const withdrawEvent = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "FundsWithdrawn");
            expect(withdrawEvent).to.not.be.null;
            expect(withdrawEvent.args[0]).to.equal(user1.address);

            // Verify the withdrawal was processed
            const info = await liquidityPool.getLenderInfo(user1.address);
            expect(info.balance).to.be.lt(ethers.parseEther("0.1")); // Balance should be reduced
        });

        it("should allow withdrawal cancellation", async function () {
            // Request withdrawal
            await liquidityPool.connect(user1).requestWithdrawal(ethers.parseEther("0.05"));

            // Cancel withdrawal
            const tx = await liquidityPool.connect(user1).cancelPrincipalWithdrawal();
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "WithdrawalCancelled");

            expect(event).to.not.be.null;
            expect(event.args[0]).to.equal(user1.address);

            // Verify withdrawal is cancelled
            const info = await liquidityPool.getLenderInfo(user1.address);
            expect(info.balance).to.equal(ethers.parseEther("0.1")); // Balance should remain unchanged
        });

        it("should handle multiple withdrawal requests", async function () {
            // First withdrawal request
            await liquidityPool.connect(user1).requestWithdrawal(ethers.parseEther("0.05"));

            // Second withdrawal request should fail
            await expect(
                liquidityPool.connect(user1).requestWithdrawal(ethers.parseEther("0.05"))
            ).to.be.revertedWith("Must wait for cooldown period");

            // Fast forward cooldown period
            await ethers.provider.send("evm_increaseTime", [86400 + 1]);
            await ethers.provider.send("evm_mine", []);

            // Complete first withdrawal
            await liquidityPool.connect(user1).completeWithdrawal();

            // Now should be able to request second withdrawal
            await liquidityPool.connect(user1).requestWithdrawal(ethers.parseEther("0.05"));
        });
    });

    describe("Interest Rate Management", function () {
        it("should allow owner to set interest rate", async function () {
            await liquidityPool.setInterestRate(10);
            expect(await liquidityPool.getInterestRate()).to.equal(10);
        });

        it("should enforce maximum interest rate", async function () {
            await expect(
                liquidityPool.setInterestRate(101)
            ).to.be.revertedWith("Interest rate too high");
        });

        it("should calculate potential interest correctly", async function () {
            const amount = ethers.parseEther("1");
            const days = 30;
            const potentialInterest = await liquidityPool.calculatePotentialInterest(amount, days);
            expect(potentialInterest).to.be.gt(0);
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
});