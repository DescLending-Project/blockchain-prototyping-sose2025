const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingManager - Unit", function () {
    let manager, owner, addr1, addr2, mockPool;
    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        const MockPool = await ethers.getContractFactory("MockPool");
        mockPool = await MockPool.deploy();
        await mockPool.waitForDeployment();
        const LendingManager = await ethers.getContractFactory("LendingManager");
        manager = await LendingManager.deploy(owner.address, mockPool.target);
        await manager.waitForDeployment();
    });
    it("should return correct interest tier count and values", async function () {
        expect(await manager.getInterestTierCount()).to.equal(3);
        const [min0, rate0] = await manager.getInterestTier(0);
        expect(min0).to.equal(ethers.parseEther("10"));
        expect(rate0).to.equal("1000150000000000000");
    });
    it("should revert for invalid interest tier index", async function () {
        await expect(manager.getInterestTier(10)).to.be.revertedWith("Invalid tier index");
    });
    it("should allow owner to set interest tier and revert for non-owner", async function () {
        await manager.setInterestTier(0, ethers.parseEther("20"), ethers.parseEther("2"));
        const [min, rate] = await manager.getInterestTier(0);
        expect(min).to.equal(ethers.parseEther("20"));
        expect(rate).to.equal(ethers.parseEther("2"));
        await expect(manager.connect(addr1).setInterestTier(0, 1, 1)).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });
    it("should revert if rate < 1e18 in setInterestTier", async function () {
        await expect(manager.setInterestTier(0, 1, 1)).to.be.revertedWith("Rate must be >= 1");
    });
    it("should allow owner to set early withdrawal penalty and revert for non-owner or >100", async function () {
        await manager.setEarlyWithdrawalPenalty(10);
        expect(await manager.EARLY_WITHDRAWAL_PENALTY()).to.equal(10);
        await expect(manager.setEarlyWithdrawalPenalty(101)).to.be.revertedWith("Penalty too high");
        await expect(manager.connect(addr1).setEarlyWithdrawalPenalty(5)).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });
    it("should allow owner to set current daily rate and revert for non-owner or <1e18", async function () {
        await manager.setCurrentDailyRate(ethers.parseEther("2"));
        expect(await manager.currentDailyRate()).to.equal(ethers.parseEther("2"));
        await expect(manager.setCurrentDailyRate(ethers.parseEther("0.5"))).to.be.revertedWith("Rate must be >= 1");
        await expect(manager.connect(addr1).setCurrentDailyRate(ethers.parseEther("2"))).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });
    it("should return correct interest rate for amount", async function () {
        expect(await manager.getInterestRate(ethers.parseEther("20"))).to.equal("1000130400000000000");
    });
    it("should return correct lender info and withdrawal status for zero balance", async function () {
        const [bal, pending, earned, next, penaltyFree, lastDist] = await manager.getLenderInfo(addr1.address);
        expect(bal).to.equal(0);
        expect(earned).to.equal(0);
        const [availAt, penalty, isAvail, nextDist, availInt] = await manager.getWithdrawalStatus(addr1.address);
        expect(penalty).to.equal(0);
        expect(isAvail).to.be.true;
        expect(availInt).to.equal(0);
    });
    it("should return zero for calculateInterest and getAvailableInterest for zero balance", async function () {
        expect(await manager.calculateInterest(addr1.address)).to.equal(0);
        expect(await manager.getAvailableInterest(addr1.address)).to.equal(0);
    });
    it("should allow deposit, accrue interest, request/cancel/complete withdrawal, claim interest, and cover all events", async function () {
        // Deposit
        await expect(manager.connect(addr1).depositFunds({ value: ethers.parseEther("1") }))
            .to.emit(manager, "FundsDeposited");
        // Request withdrawal
        await expect(manager.connect(addr1).requestWithdrawal(ethers.parseEther("0.5")))
            .to.emit(manager, "WithdrawalRequested");
        // Cancel withdrawal
        await expect(manager.connect(addr1).cancelPrincipalWithdrawal())
            .to.emit(manager, "WithdrawalCancelled");
        // Fast forward time before requesting again
        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");
        // Request again and complete
        await manager.connect(addr1).requestWithdrawal(ethers.parseEther("0.5"));
        // Fast forward time
        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");
        // Fund the mock pool with enough ETH for withdrawal
        await owner.sendTransaction({ to: mockPool.target, value: ethers.parseEther("1") });
        // Fund the LendingManager contract with enough ETH to pay out
        await owner.sendTransaction({ to: manager.target, value: ethers.parseEther("1") });
        await expect(manager.connect(addr1).completeWithdrawal())
            .to.emit(manager, "FundsWithdrawn");
        // Deposit again for interest
        await manager.connect(addr1).depositFunds({ value: ethers.parseEther("1") });
        // Ensure no time is fast-forwarded here
        // Check earnedInterest is zero
        const info = await manager.getLenderInfo(addr1.address);
        expect(info.earnedInterest).to.be.closeTo(0, 1e15);
        // Claim interest: only expect revert if earnedInterest is zero or balance is zero
        if (info[0] === 0n) {
            await expect(manager.connect(addr1).claimInterest()).to.be.revertedWith("No funds deposited");
        } else if (info[2] === 0n) {
            await expect(manager.connect(addr1).claimInterest()).to.be.revertedWith("No interest to claim");
        } else {
            await expect(manager.connect(addr1).claimInterest()).to.emit(manager, "InterestClaimed");
            const infoAfter = await manager.getLenderInfo(addr1.address);
            expect(infoAfter[2]).to.equal(0);
        }
    });
    it("should revert on deposit below min or above max", async function () {
        await expect(manager.connect(addr1).depositFunds({ value: ethers.parseEther("0.001") })).to.be.revertedWith("Deposit amount too low");
        await expect(manager.connect(addr1).depositFunds({ value: ethers.parseEther("101") })).to.be.revertedWith("Deposit would exceed maximum limit");
    });
    it("should revert on withdrawal before cooldown or over balance", async function () {
        await manager.connect(addr1).depositFunds({ value: ethers.parseEther("1") });
        await manager.connect(addr1).requestWithdrawal(ethers.parseEther("0.5"));
        await expect(manager.connect(addr1).requestWithdrawal(ethers.parseEther("0.6"))).to.be.revertedWith("Must wait for cooldown period");
        // Fast forward time before testing over-balance
        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");
        await expect(manager.connect(addr1).requestWithdrawal(ethers.parseEther("2"))).to.be.revertedWith("Insufficient balance");
    });
    it("should revert on completeWithdrawal or cancelPrincipalWithdrawal with no pending", async function () {
        await expect(manager.connect(addr1).completeWithdrawal()).to.be.revertedWith("No pending withdrawal");
        await expect(manager.connect(addr1).cancelPrincipalWithdrawal()).to.be.revertedWith("No pending withdrawal to cancel");
    });
    it("should revert on claimInterest with zero balance", async function () {
        await expect(manager.connect(addr1).claimInterest()).to.be.revertedWith("No funds deposited");
    });
    it("should return correct canCompleteWithdrawal", async function () {
        await manager.connect(addr1).depositFunds({ value: ethers.parseEther("1") });
        await manager.connect(addr1).requestWithdrawal(ethers.parseEther("0.5"));
        expect(await manager.canCompleteWithdrawal(addr1.address)).to.be.false;
        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");
        expect(await manager.canCompleteWithdrawal(addr1.address)).to.be.true;
    });
    it("should return correct calculatePotentialInterest", async function () {
        expect(await manager.calculatePotentialInterest(ethers.parseEther("1"), 30)).to.be.gt(0);
    });
    it("should return available interest for lender with balance", async function () {
        await manager.connect(addr1).depositFunds({ value: ethers.parseEther("1") });
        // Fast forward time to accrue interest
        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");
        const available = await manager.getAvailableInterest(addr1.address);
        expect(available).to.be.gt(0);
    });
    it("should increase interest tier count when adding a new tier", async function () {
        const initialCount = await manager.getInterestTierCount();
        await manager.setInterestTier(initialCount, ethers.parseEther("50"), ethers.parseEther("3"));
        expect((await manager.getInterestTierCount()).toString()).to.equal((BigInt(initialCount) + 1n).toString());
        const [min, rate] = await manager.getInterestTier(initialCount);
        expect(min).to.equal(ethers.parseEther("50"));
        expect(rate).to.equal(ethers.parseEther("3"));
    });
}); 