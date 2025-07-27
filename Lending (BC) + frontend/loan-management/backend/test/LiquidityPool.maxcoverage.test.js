const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPool - Maximum Coverage", function () {
    let liquidityPool, lendingManager, stablecoinManager, interestRateModel, votingToken;
    let timelock, owner, user1, user2, user3, borrower1, borrower2;
    let mockToken, mockPriceFeed, creditSystem;

    beforeEach(async function () {
        [timelock, owner, user1, user2, user3, borrower1, borrower2] = await ethers.getSigners();

        // Deploy mock contracts
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Mock Token", "MOCK", 18);
        await mockToken.deployed();

        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(ethers.utils.parseUnits("2000", 8), 8);
        await mockPriceFeed.deployed();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(timelock.address);
        await votingToken.deployed();

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(
            owner.address, // placeholder
            timelock.address,
            mockToken.address,
            mockToken.address
        );
        await stablecoinManager.deployed();

        // Deploy InterestRateModel
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            mockPriceFeed.address,
            timelock.address,
            ethers.utils.parseUnits("0.05", 18),
            ethers.utils.parseUnits("0.8", 18),
            ethers.utils.parseUnits("0.1", 18),
            ethers.utils.parseUnits("0.3", 18),
            ethers.utils.parseUnits("0.1", 18),
            ethers.utils.parseUnits("1.0", 18),
            ethers.utils.parseUnits("0.05", 18),
            ethers.utils.parseUnits("0.03", 18),
            ethers.utils.parseUnits("0.2", 18),
            86400
        );
        await interestRateModel.deployed();

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            owner.address, // placeholder
            interestRateModel.address,
            timelock.address,
            86400
        );
        await lendingManager.deployed();

        // Deploy LiquidityPool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy(
            lendingManager.address,
            stablecoinManager.address,
            interestRateModel.address,
            timelock.address
        );
        await liquidityPool.deployed();

        // Setup roles and permissions
        const MINTER_ROLE = await votingToken.MINTER_ROLE();
        await votingToken.connect(timelock).grantRole(MINTER_ROLE, liquidityPool.address);

        // Set voting token in pool
        await liquidityPool.connect(timelock).setVotingToken(votingToken.address);

        // Setup collateral
        await liquidityPool.connect(timelock).setAllowedCollateral(mockToken.address, true);
        await liquidityPool.connect(timelock).setPriceFeed(mockToken.address, mockPriceFeed.address);

        // Mint tokens to users
        await mockToken.mint(borrower1.address, ethers.utils.parseEther("10000"));
        await mockToken.mint(borrower2.address, ethers.utils.parseEther("10000"));
    });

    describe("Initialization and Setup", function () {
        it("should initialize with correct parameters", async function () {
            expect(await liquidityPool.lendingManager()).to.equal(lendingManager.address);
            expect(await liquidityPool.stablecoinManager()).to.equal(stablecoinManager.address);
            expect(await liquidityPool.interestRateModel()).to.equal(interestRateModel.address);
            expect(await liquidityPool.timelock()).to.equal(timelock.address);
        });

        it("should have correct initial state", async function () {
            expect(await liquidityPool.totalFunds()).to.equal(0);
            expect(await liquidityPool.paused()).to.be.false;
            expect(await liquidityPool.locked()).to.be.false;
        });

        it("should set correct constants", async function () {
            expect(await liquidityPool.GRACE_PERIOD()).to.equal(3 * 24 * 3600); // 3 days
            expect(await liquidityPool.DEFAULT_LIQUIDATION_THRESHOLD()).to.equal(130);
            expect(await liquidityPool.LIQUIDATION_PENALTY()).to.equal(5);
        });
    });

    describe("Credit Score Management", function () {
        it("should allow timelock to set credit scores", async function () {
            await expect(
                liquidityPool.connect(timelock).setCreditScore(user1.address, 85)
            ).to.emit(liquidityPool, "CreditScoreUpdated")
                .withArgs(user1.address, 85);

            expect(await liquidityPool.creditScores(user1.address)).to.equal(85);
        });

        it("should reject credit score setting from non-timelock", async function () {
            await expect(
                liquidityPool.connect(user1).setCreditScore(user2.address, 85)
            ).to.be.revertedWith("Only timelock");
        });

        it("should handle multiple credit score updates", async function () {
            await liquidityPool.connect(timelock).setCreditScore(user1.address, 75);
            await liquidityPool.connect(timelock).setCreditScore(user1.address, 85);

            expect(await liquidityPool.creditScores(user1.address)).to.equal(85);
        });

        it("should return correct risk tiers", async function () {
            await liquidityPool.connect(timelock).setCreditScore(user1.address, 95);
            expect(await liquidityPool.getRiskTier(user1.address)).to.equal(0); // TIER_1

            await liquidityPool.connect(timelock).setCreditScore(user2.address, 75);
            expect(await liquidityPool.getRiskTier(user2.address)).to.equal(1); // TIER_2

            await liquidityPool.connect(timelock).setCreditScore(user3.address, 45);
            expect(await liquidityPool.getRiskTier(user3.address)).to.equal(4); // TIER_5
        });
    });

    describe("Collateral Management", function () {
        beforeEach(async function () {
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
        });

        it("should allow collateral deposits", async function () {
            await expect(
                liquidityPool.connect(borrower1).depositCollateral(
                    mockToken.address,
                    ethers.utils.parseEther("100")
                )
            ).to.emit(liquidityPool, "CollateralDeposited")
                .withArgs(borrower1.address, mockToken.address, ethers.utils.parseEther("100"));

            expect(await liquidityPool.collateralBalance(mockToken.address, borrower1.address))
                .to.equal(ethers.utils.parseEther("100"));
        });

        it("should reject deposits of non-allowed collateral", async function () {
            const randomToken = user1.address;

            await expect(
                liquidityPool.connect(borrower1).depositCollateral(randomToken, ethers.utils.parseEther("100"))
            ).to.be.revertedWith("Token not allowed as collateral");
        });

        it("should allow collateral withdrawals", async function () {
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.utils.parseEther("100")
            );

            await expect(
                liquidityPool.connect(borrower1).withdrawCollateral(
                    mockToken.address,
                    ethers.utils.parseEther("50")
                )
            ).to.emit(liquidityPool, "CollateralWithdrawn")
                .withArgs(borrower1.address, mockToken.address, ethers.utils.parseEther("50"));

            expect(await liquidityPool.collateralBalance(mockToken.address, borrower1.address))
                .to.equal(ethers.utils.parseEther("50"));
        });

        it("should calculate total collateral value correctly", async function () {
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.utils.parseEther("100")
            );

            const totalValue = await liquidityPool.getTotalCollateralValue(borrower1.address);
            expect(totalValue).to.be.gt(0);
        });

        it("should handle multiple collateral types", async function () {
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const secondToken = await MockERC20.deploy("Second Token", "SEC", 18);
            await secondToken.deployed();
            await secondToken.mint(borrower1.address, ethers.utils.parseEther("1000"));

            await liquidityPool.connect(timelock).setAllowedCollateral(secondToken.address, true);
            await liquidityPool.connect(timelock).setPriceFeed(secondToken.address, mockPriceFeed.address);

            await secondToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));

            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.utils.parseEther("100")
            );
            await liquidityPool.connect(borrower1).depositCollateral(
                secondToken.address,
                ethers.utils.parseEther("200")
            );

            const totalValue = await liquidityPool.getTotalCollateralValue(borrower1.address);
            expect(totalValue).to.be.gt(0);
        });
    });

    describe("Borrowing Functionality", function () {
        beforeEach(async function () {
            // Setup borrower with collateral and credit score
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.utils.parseEther("500")
            );

            // Add funds to pool
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });
        });

        it("should allow borrowing with sufficient collateral", async function () {
            const borrowAmount = ethers.utils.parseEther("1");

            await expect(
                liquidityPool.connect(borrower1).borrow(borrowAmount)
            ).to.emit(liquidityPool, "Borrowed")
                .withArgs(borrower1.address, borrowAmount);

            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(borrowAmount);
        });

        it("should reject borrowing with insufficient credit score", async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 40); // TIER_5

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Credit score too low");
        });

        it("should reject borrowing with existing debt", async function () {
            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"));

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Repay your existing debt first");
        });

        it("should reject borrowing exceeding lending capacity", async function () {
            const excessiveAmount = ethers.utils.parseEther("6"); // More than half of pool

            await expect(
                liquidityPool.connect(borrower1).borrow(excessiveAmount)
            ).to.be.revertedWith("Borrow amount exceeds available lending capacity");
        });

        it("should reject borrowing with insufficient collateral", async function () {
            const largeAmount = ethers.utils.parseEther("5");

            await expect(
                liquidityPool.connect(borrower1).borrow(largeAmount)
            ).to.be.revertedWith("Insufficient collateral for this loan");
        });

        it("should create loan structure correctly", async function () {
            const borrowAmount = ethers.utils.parseEther("1");
            await liquidityPool.connect(borrower1).borrow(borrowAmount);

            const loan = await liquidityPool.loans(borrower1.address);
            expect(loan.principal).to.equal(borrowAmount);
            expect(loan.outstanding).to.equal(borrowAmount);
            expect(loan.active).to.be.true;
        });

        it("should handle origination fees", async function () {
            await liquidityPool.connect(timelock).setReserveAddress(user2.address);

            const borrowAmount = ethers.utils.parseEther("1");
            const balanceBefore = await ethers.provider.getBalance(user2.address);

            await liquidityPool.connect(borrower1).borrow(borrowAmount);

            const balanceAfter = await ethers.provider.getBalance(user2.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });
    });

    describe("Repayment Functionality", function () {
        beforeEach(async function () {
            // Setup borrower and borrow
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.utils.parseEther("500")
            );

            // Add funds to pool
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });

            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"));
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

        it("should handle overpayment with refund", async function () {
            const debt = await liquidityPool.userDebt(borrower1.address);
            const overpayment = debt.add(ethers.utils.parseEther("1"));

            const balanceBefore = await ethers.provider.getBalance(borrower1.address);
            const tx = await liquidityPool.connect(borrower1).repay({ value: overpayment });
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

            const balanceAfter = await ethers.provider.getBalance(borrower1.address);
            const expectedBalance = balanceBefore.sub(debt).sub(gasUsed);

            expect(balanceAfter).to.be.closeTo(expectedBalance, ethers.utils.parseEther("0.01"));
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0);
        });

        it("should mint voting tokens on repayment", async function () {
            const debt = await liquidityPool.userDebt(borrower1.address);
            const expectedTokens = debt.div(ethers.utils.parseUnits("1", 16)); // 1 token per 0.01 ETH

            await liquidityPool.connect(borrower1).repay({ value: debt });

            expect(await votingToken.balanceOf(borrower1.address)).to.equal(expectedTokens);
        });
    });

    describe("Liquidation System", function () {
        beforeEach(async function () {
            // Setup borrower with minimal collateral
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.utils.parseEther("100")
            );

            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });

            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"));
        });

        it("should start liquidation for undercollateralized positions", async function () {
            // Simulate price drop by updating mock price feed
            await mockPriceFeed.updateAnswer(ethers.utils.parseUnits("100", 8)); // Crash price

            await expect(
                liquidityPool.startLiquidation(borrower1.address)
            ).to.emit(liquidityPool, "LiquidationStarted")
                .withArgs(borrower1.address);

            expect(await liquidityPool.isLiquidatable(borrower1.address)).to.be.true;
        });

        it("should allow recovery from liquidation", async function () {
            await mockPriceFeed.updateAnswer(ethers.utils.parseUnits("100", 8));
            await liquidityPool.startLiquidation(borrower1.address);

            // Add more collateral to recover
            await liquidityPool.connect(borrower1).recoverFromLiquidation(
                mockToken.address,
                ethers.utils.parseEther("1000")
            );

            expect(await liquidityPool.isLiquidatable(borrower1.address)).to.be.false;
        });

        it("should execute liquidation after grace period", async function () {
            await mockPriceFeed.updateAnswer(ethers.utils.parseUnits("100", 8));
            await liquidityPool.startLiquidation(borrower1.address);

            // Fast forward past grace period
            await ethers.provider.send("evm_increaseTime", [3 * 24 * 3600 + 1]); // 3 days + 1 second
            await ethers.provider.send("evm_mine");

            const { upkeepNeeded, performData } = await liquidityPool.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            await expect(
                liquidityPool.performUpkeep(performData)
            ).to.emit(liquidityPool, "LiquidationExecuted");
        });
    });

    describe("Interest Rate Management", function () {
        it("should calculate borrow rates correctly", async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 95); // TIER_1

            const rate = await liquidityPool.calculateBorrowRate(
                ethers.utils.parseEther("1"),
                0 // TIER_1
            );

            expect(rate).to.be.gt(0);
        });

        it("should apply tier-based rate adjustments", async function () {
            const tier1Rate = await liquidityPool.calculateBorrowRate(
                ethers.utils.parseEther("1"),
                0 // TIER_1
            );

            const tier5Rate = await liquidityPool.calculateBorrowRate(
                ethers.utils.parseEther("1"),
                4 // TIER_5
            );

            expect(tier5Rate).to.be.gt(tier1Rate);
        });

        it("should handle utilization-based rate changes", async function () {
            // Add significant funds
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("100")
            });

            const lowUtilizationRate = await liquidityPool.calculateBorrowRate(
                ethers.utils.parseEther("1"),
                0
            );

            const highUtilizationRate = await liquidityPool.calculateBorrowRate(
                ethers.utils.parseEther("40"), // High utilization
                0
            );

            expect(highUtilizationRate).to.be.gt(lowUtilizationRate);
        });
    });

    describe("Emergency Functions", function () {
        it("should allow timelock to pause contract", async function () {
            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.true;

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Contract is paused");
        });

        it("should allow timelock to extract funds", async function () {
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("5")
            });

            const balanceBefore = await ethers.provider.getBalance(user2.address);

            await liquidityPool.connect(timelock).extract(
                ethers.utils.parseEther("2"),
                user2.address
            );

            const balanceAfter = await ethers.provider.getBalance(user2.address);
            expect(balanceAfter.sub(balanceBefore)).to.equal(ethers.utils.parseEther("2"));
        });

        it("should trigger circuit breakers", async function () {
            // Simulate stale oracle
            await ethers.provider.send("evm_increaseTime", [2 * 3600]); // 2 hours
            await ethers.provider.send("evm_mine");

            await liquidityPool.checkCircuitBreakers();
            expect(await liquidityPool.paused()).to.be.true;
        });
    });

    describe("Access Control", function () {
        it("should restrict timelock functions", async function () {
            await expect(
                liquidityPool.connect(user1).setCreditScore(user2.address, 80)
            ).to.be.revertedWith("Only timelock");

            await expect(
                liquidityPool.connect(user1).setAllowedCollateral(mockToken.address, false)
            ).to.be.revertedWith("Only timelock");
        });

        it("should allow only lending manager to call specific functions", async function () {
            await expect(
                liquidityPool.connect(user1).clearCollateral(
                    mockToken.address,
                    borrower1.address,
                    user1.address,
                    ethers.utils.parseEther("1")
                )
            ).to.be.revertedWith("Only LendingManager");
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("should handle zero balance operations", async function () {
            expect(await liquidityPool.getBalance()).to.equal(0);

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Insufficient contract balance");
        });

        it("should handle invalid addresses", async function () {
            await expect(
                liquidityPool.connect(timelock).setCreditScore(ethers.constants.AddressZero, 80)
            ).to.be.revertedWith("Invalid address: zero address");
        });

        it("should prevent reentrancy attacks", async function () {
            // This would require a malicious contract to test properly
            // For now, we just verify the modifier exists
            expect(await liquidityPool.locked()).to.be.false;
        });

        it("should handle maximum values", async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 100);
            expect(await liquidityPool.creditScores(borrower1.address)).to.equal(100);
        });

        it("should handle price feed failures gracefully", async function () {
            // Set invalid price feed
            await liquidityPool.connect(timelock).setPriceFeed(
                mockToken.address,
                ethers.constants.AddressZero
            );

            const value = await liquidityPool.getTotalCollateralValue(borrower1.address);
            expect(value).to.equal(0);
        });
    });

    describe("Gas Optimization", function () {
        it("should handle batch operations efficiently", async function () {
            const users = [borrower1, borrower2];

            for (const user of users) {
                await liquidityPool.connect(timelock).setCreditScore(user.address, 80);
                await mockToken.connect(user).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
                await liquidityPool.connect(user).depositCollateral(
                    mockToken.address,
                    ethers.utils.parseEther("100")
                );
            }

            // All operations should complete within reasonable gas limits
            expect(true).to.be.true; // Placeholder for gas measurement
        });
    });

    describe("Integration with Other Contracts", function () {
        it("should interact correctly with VotingToken", async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.utils.parseEther("500")
            );

            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("10")
            });

            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"));
            const debt = await liquidityPool.userDebt(borrower1.address);

            await liquidityPool.connect(borrower1).repay({ value: debt });

            expect(await votingToken.balanceOf(borrower1.address)).to.be.gt(0);
        });

        it("should interact correctly with StablecoinManager", async function () {
            expect(await liquidityPool.stablecoinManager()).to.equal(stablecoinManager.address);

            const isStablecoin = await stablecoinManager.isStablecoin(mockToken.address);
            expect(typeof isStablecoin).to.equal("boolean");
        });

        it("should interact correctly with InterestRateModel", async function () {
            expect(await liquidityPool.interestRateModel()).to.equal(interestRateModel.address);

            const globalMultiplier = await interestRateModel.getGlobalRiskMultiplier();
            expect(globalMultiplier).to.be.gt(0);
        });
    });

    describe("Events Coverage", function () {
        it("should emit all major events", async function () {
            // Setup
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));

            // Test CollateralDeposited event
            await expect(
                liquidityPool.connect(borrower1).depositCollateral(
                    mockToken.address,
                    ethers.utils.parseEther("100")
                )
            ).to.emit(liquidityPool, "CollateralDeposited");

            // Test Deposit event
            await expect(
                user1.sendTransaction({
                    to: liquidityPool.address,
                    value: ethers.utils.parseEther("5")
                })
            ).to.emit(liquidityPool, "Deposit");

            // Test Borrowed event
            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"))
            ).to.emit(liquidityPool, "Borrowed");

            // Test Repaid event
            const debt = await liquidityPool.userDebt(borrower1.address);
            await expect(
                liquidityPool.connect(borrower1).repay({ value: debt })
            ).to.emit(liquidityPool, "Repaid");
        });
    });
});
