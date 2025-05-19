const { assert, expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config.js");

describe("LiquidityPoolV1", function () {
    let liquidityPool, deployer, user1, user2;
    const sendValue = ethers.parseEther("1"); // 1 ETH

    beforeEach(async function () {
        [deployer, user1, user2] = await ethers.getSigners();
        const LiquidityPoolV1 = await ethers.getContractFactory("LiquidityPoolV1");
        liquidityPool = await upgrades.deployProxy(LiquidityPoolV1, [deployer.address], {
            initializer: "initialize",
        });
        await liquidityPool.waitForDeployment();
        // No pool funding here!
    });

    describe("Deployment", function () {
        it("should set the right owner", async function () {
            expect(await liquidityPool.owner()).to.equal(deployer.address);
        });

        it("should have 0 totalFunds initially", async function () {
            expect(await liquidityPool.totalFunds()).to.equal(0n);
        });
    });

    describe("receive", function () {
        it("should increase totalFunds when receiving ETH", async function () {
            // Fund pool first
            await deployer.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: sendValue
            });
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
            ).to.be.revertedWith("Not owner");
        });

        it("should revert if trying to extract more than balance", async function () {
            await expect(
                liquidityPool.extract(ethers.parseEther("2"))
            ).to.be.revertedWith("Insufficient balance");
        });
    });

    describe("borrow", function () {
        beforeEach(async function () {
            // Fund pool and set credit score
            await deployer.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: sendValue
            });
            await liquidityPool.setCreditScore(user1.address, 80);
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
            const poolBalance = await ethers.provider.getBalance(await liquidityPool.getAddress());
            const borrowAmount = poolBalance / 2n + 1n;
            await expect(
                liquidityPool.connect(user1).borrow(borrowAmount)
            ).to.be.revertedWith("Insufficient funds in the pool");
        });
    });

    describe("repay", function () {
        beforeEach(async function () {
            // Fund pool, set credit score, and borrow
            await deployer.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: sendValue
            });
            await liquidityPool.setCreditScore(user1.address, 80);
            const borrowAmount = ethers.parseEther("0.1");
            await liquidityPool.connect(user1).borrow(borrowAmount);
        });

        it("should allow partial repayment", async function () {
            const repayAmount = ethers.parseEther("0.05");
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
                ethers.parseEther("0.05").toString()
            );
        });

        it("should allow full repayment", async function () {
            const debt = await liquidityPool.userDebt(user1.address);
            const tx = await liquidityPool.connect(user1).repay({ value: debt });
            const receipt = await tx.wait();
            const event = receipt.logs
                .map(log => {
                    try { return liquidityPool.interface.parseLog(log); } catch { return null; }
                })
                .find(e => e && e.name === "Repaid");
            expect(event.args[0]).to.equal(user1.address);
            expect(event.args[1]).to.equal(debt);
            const remainingDebt = await liquidityPool.userDebt(user1.address);
            assert.equal(remainingDebt.toString(), "0");
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
            ).to.be.revertedWith("Not owner");
        });
    });

    describe("transferOwnership", function () {
        it("should transfer ownership correctly", async function () {
            await liquidityPool.transferOwnership(user1.address);
            const newOwner = await liquidityPool.owner();
            assert.equal(newOwner, user1.address);
        });

        it("should revert when non-owner tries to transfer", async function () {
            await expect(
                liquidityPool.connect(user1).transferOwnership(user2.address)
            ).to.be.revertedWith("Not owner");
        });
    });
});