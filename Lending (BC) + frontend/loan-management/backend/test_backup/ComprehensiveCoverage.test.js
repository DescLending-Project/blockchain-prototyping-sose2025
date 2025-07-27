const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Comprehensive Contract Coverage", function () {
    let votingToken, timelock, governor, liquidityPool, lendingManager, stablecoinManager;
    let interestRateModel, glintToken, mockPriceFeed, mockToken;
    let owner, user1, user2, user3, borrower1, borrower2, liquidator;

    beforeEach(async function () {
        [owner, user1, user2, user3, borrower1, borrower2, liquidator] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy();

        // Deploy TimelockController
        const TimelockController = await ethers.getContractFactory("TimelockController");
        timelock = await TimelockController.deploy(
            60, // 1 minute delay
            [owner.address], // proposers
            [owner.address], // executors
            owner.address // admin
        );

        // Deploy ProtocolGovernor
        const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
        governor = await ProtocolGovernor.deploy(
            votingToken.address,
            timelock.address
        );

        // Deploy MockPriceFeed
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(
            ethers.parseUnits("2000", 8), // $2000
            8
        );

        // Deploy MockToken
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock Token", "MOCK");

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(timelock.address);

        // Deploy InterestRateModel
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(timelock.address);

        // Deploy GlintToken
        const GlintToken = await ethers.getContractFactory("GlintToken");
        glintToken = await GlintToken.deploy();

        // Deploy LiquidityPool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy(
            timelock.address,
            stablecoinManager.address,
            interestRateModel.address,
            votingToken.address
        );

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            liquidityPool.address,
            stablecoinManager.address,
            timelock.address,
            votingToken.address
        );

        // Setup connections
        await liquidityPool.connect(timelock).setLendingManager(lendingManager.address);
        await votingToken.connect(owner).setLiquidityPool(liquidityPool.address);
        await votingToken.connect(owner).setProtocolGovernor(governor.address);

        // Setup collateral and price feeds
        await liquidityPool.connect(timelock).setAllowedCollateral(mockToken.address, true);
        await liquidityPool.connect(timelock).setPriceFeed(mockToken.address, mockPriceFeed.address);
        await stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 120);

        // Fund mock tokens
        await mockToken.mint(borrower1.address, ethers.parseEther("10000"));
        await mockToken.mint(borrower2.address, ethers.parseEther("10000"));
        await mockToken.mint(user1.address, ethers.parseEther("10000"));
    });

    describe("VotingToken - Complete Coverage", function () {
        it("should handle all minting scenarios", async function () {
            // Test minting by liquidity pool
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await votingToken.connect(user1).mint(user2.address, 100);
            expect(await votingToken.balanceOf(user2.address)).to.equal(100);

            // Test minting limits
            await expect(
                votingToken.connect(user2).mint(user1.address, 100)
            ).to.be.revertedWith("Only LiquidityPool can mint");
        });

        it("should handle reputation penalties", async function () {
            await votingToken.connect(owner).setProtocolGovernor(user1.address);
            await votingToken.connect(user1).mint(user2.address, 1000);

            // Test positive penalty (reduction)
            await votingToken.connect(user1).penalizeReputation(user2.address, 100);
            expect(await votingToken.balanceOf(user2.address)).to.equal(900);

            // Test negative penalty (increase)
            await votingToken.connect(user1).penalizeReputation(user2.address, -200);
            expect(await votingToken.balanceOf(user2.address)).to.equal(1100);

            // Test penalty exceeding balance
            await votingToken.connect(user1).penalizeReputation(user2.address, 2000);
            expect(await votingToken.balanceOf(user2.address)).to.equal(0);
        });

        it("should handle all access control scenarios", async function () {
            // Test unauthorized minting
            await expect(
                votingToken.connect(user1).mint(user2.address, 100)
            ).to.be.revertedWith("Only LiquidityPool can mint");

            // Test unauthorized penalty
            await expect(
                votingToken.connect(user1).penalizeReputation(user2.address, 100)
            ).to.be.revertedWith("Only ProtocolGovernor can penalize");

            // Test owner functions
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await votingToken.connect(owner).setProtocolGovernor(user2.address);

            // Test non-owner access
            await expect(
                votingToken.connect(user1).setLiquidityPool(user2.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should handle edge cases", async function () {
            // Test zero address scenarios
            await expect(
                votingToken.connect(owner).setLiquidityPool(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");

            await expect(
                votingToken.connect(owner).setProtocolGovernor(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");

            // Test minting to zero address
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await expect(
                votingToken.connect(user1).mint(ethers.ZeroAddress, 100)
            ).to.be.revertedWith("ERC721: mint to the zero address");
        });
    });

    describe("ProtocolGovernor - Complete Coverage", function () {
        beforeEach(async function () {
            // Mint voting tokens for governance
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await votingToken.connect(user1).mint(user1.address, 1000);
            await votingToken.connect(user1).mint(user2.address, 500);
        });

        it("should handle proposal creation and execution", async function () {
            const targets = [liquidityPool.address];
            const values = [0];
            const calldatas = [liquidityPool.interface.encodeFunctionData("togglePause", [])];
            const description = "Toggle pause";

            // Create proposal
            await governor.connect(user1).propose(targets, values, calldatas, description);
            const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description)));

            // Fast forward to voting period
            await ethers.provider.send("evm_mine");

            // Vote
            await governor.connect(user1).castVote(proposalId, 1); // For
            await governor.connect(user2).castVote(proposalId, 1); // For

            // Fast forward past voting period
            for (let i = 0; i < 50400; i++) { // 1 week
                await ethers.provider.send("evm_mine");
            }

            // Queue proposal
            await governor.queue(targets, values, calldatas, ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description)));

            // Fast forward past timelock delay
            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine");

            // Execute proposal
            await governor.execute(targets, values, calldatas, ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description)));
        });

        it("should handle voting scenarios", async function () {
            const targets = [liquidityPool.address];
            const values = [0];
            const calldatas = [liquidityPool.interface.encodeFunctionData("togglePause", [])];
            const description = "Test proposal";

            await governor.connect(user1).propose(targets, values, calldatas, description);
            const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description)));

            await ethers.provider.send("evm_mine");

            // Test different vote types
            await governor.connect(user1).castVote(proposalId, 0); // Against
            await governor.connect(user2).castVote(proposalId, 1); // For

            // Test vote with reason
            await governor.connect(user1).castVoteWithReason(proposalId, 2, "Abstaining for testing");

            const proposal = await governor.proposals(proposalId);
            expect(proposal.forVotes).to.be.gt(0);
        });

        it("should handle reputation penalties", async function () {
            await governor.connect(owner).penalizeReputation(user1.address, 100);
            expect(await votingToken.balanceOf(user1.address)).to.equal(900);
        });
    });

    describe("LiquidityPool - Complete Coverage", function () {
        beforeEach(async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.parseEther("10000"));
        });

        it("should handle all deposit scenarios", async function () {
            // Direct ETH deposit
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.parseEther("5")
            });
            expect(await liquidityPool.getBalance()).to.equal(ethers.parseEther("5"));

            // Deposit function call
            await liquidityPool.connect(user2).deposit({ value: ethers.parseEther("3") });
            expect(await liquidityPool.getBalance()).to.equal(ethers.parseEther("8"));

            // Test lender balance tracking
            expect(await liquidityPool.lenderBalances(user1.address)).to.equal(ethers.parseEther("5"));
        });

        it("should handle all withdrawal scenarios", async function () {
            // Setup deposits
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("10") });

            // Partial withdrawal
            await liquidityPool.connect(user1).withdraw(ethers.parseEther("3"));
            expect(await liquidityPool.lenderBalances(user1.address)).to.equal(ethers.parseEther("7"));

            // Full withdrawal
            await liquidityPool.connect(user1).withdraw(ethers.parseEther("7"));
            expect(await liquidityPool.lenderBalances(user1.address)).to.equal(0);

            // Test withdrawal exceeding balance
            await expect(
                liquidityPool.connect(user1).withdraw(ethers.parseEther("1"))
            ).to.be.revertedWith("Insufficient balance");
        });

        it("should handle all collateral operations", async function () {
            // Deposit collateral
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("1000")
            );

            expect(await liquidityPool.collateralBalances(borrower1.address, mockToken.address))
                .to.equal(ethers.parseEther("1000"));

            // Withdraw collateral
            await liquidityPool.connect(borrower1).withdrawCollateral(
                mockToken.address,
                ethers.parseEther("500")
            );

            expect(await liquidityPool.collateralBalances(borrower1.address, mockToken.address))
                .to.equal(ethers.parseEther("500"));

            // Test insufficient collateral withdrawal
            await expect(
                liquidityPool.connect(borrower1).withdrawCollateral(
                    mockToken.address,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWith("Insufficient collateral balance");
        });

        it("should handle all borrowing scenarios", async function () {
            // Setup
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );

            // Normal borrow
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));
            expect(await liquidityPool.userDebt(borrower1.address)).to.be.gt(ethers.parseEther("5"));

            // Test borrow limits
            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("50"))
            ).to.be.revertedWith("Borrow amount exceeds available lending capacity");

            // Test insufficient collateral
            await liquidityPool.connect(timelock).setCreditScore(borrower2.address, 80);
            await expect(
                liquidityPool.connect(borrower2).borrow(ethers.parseEther("1"))
            ).to.be.revertedWith("Insufficient collateral for this loan");
        });

        it("should handle all repayment scenarios", async function () {
            // Setup borrow
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));

            const debt = await liquidityPool.userDebt(borrower1.address);

            // Partial repayment
            const partialAmount = debt.div(2);
            await liquidityPool.connect(borrower1).repay({ value: partialAmount });
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(debt.sub(partialAmount));

            // Full repayment
            const remainingDebt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: remainingDebt });
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0);

            // Test overpayment
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"));
            const newDebt = await liquidityPool.userDebt(borrower1.address);
            const overpayment = newDebt.add(ethers.parseEther("2"));

            const balanceBefore = await ethers.provider.getBalance(borrower1.address);
            const tx = await liquidityPool.connect(borrower1).repay({ value: overpayment });
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            const balanceAfter = await ethers.provider.getBalance(borrower1.address);

            expect(balanceAfter).to.be.closeTo(
                balanceBefore.sub(newDebt).sub(gasUsed),
                ethers.parseEther("0.01")
            );
        });

        it("should handle all liquidation scenarios", async function () {
            // Setup undercollateralized position
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("100")
            );
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"));

            // Crash price to trigger liquidation
            await mockPriceFeed.updateAnswer(ethers.parseUnits("100", 8));

            // Start liquidation
            await liquidityPool.startLiquidation(borrower1.address);
            expect(await liquidityPool.isLiquidatable(borrower1.address)).to.be.true;

            // Test recovery
            await liquidityPool.connect(borrower1).recoverFromLiquidation(
                mockToken.address,
                ethers.parseEther("5000")
            );
            expect(await liquidityPool.isLiquidatable(borrower1.address)).to.be.false;

            // Test liquidation execution
            await liquidityPool.startLiquidation(borrower1.address);
            await ethers.provider.send("evm_increaseTime", [3 * 24 * 3600 + 1]);
            await ethers.provider.send("evm_mine");

            const { upkeepNeeded, performData } = await liquidityPool.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            await liquidityPool.performUpkeep(performData);
        });

        it("should handle all admin functions", async function () {
            // Test pause functionality
            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.true;

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"))
            ).to.be.revertedWith("Contract is paused");

            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.false;

            // Test fund extraction
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("10") });
            const balanceBefore = await ethers.provider.getBalance(user2.address);

            await liquidityPool.connect(timelock).extract(
                ethers.parseEther("5"),
                user2.address
            );

            const balanceAfter = await ethers.provider.getBalance(user2.address);
            expect(balanceAfter.sub(balanceBefore)).to.equal(ethers.parseEther("5"));

            // Test credit score management
            await liquidityPool.connect(timelock).setCreditScore(user3.address, 95);
            expect(await liquidityPool.creditScores(user3.address)).to.equal(95);

            // Test collateral management
            await liquidityPool.connect(timelock).setAllowedCollateral(user3.address, true);
            expect(await liquidityPool.allowedCollateral(user3.address)).to.be.true;

            // Test price feed management
            await liquidityPool.connect(timelock).setPriceFeed(user3.address, mockPriceFeed.address);
            expect(await liquidityPool.priceFeeds(user3.address)).to.equal(mockPriceFeed.address);
        });

        it("should handle all view functions", async function () {
            // Setup data
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("10") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("1000")
            );

            // Test view functions
            expect(await liquidityPool.getBalance()).to.equal(ethers.parseEther("10"));
            expect(await liquidityPool.getTotalCollateralValue(borrower1.address)).to.be.gt(0);
            expect(await liquidityPool.calculateBorrowRate(ethers.parseEther("1"), 0)).to.be.gt(0);
            expect(await liquidityPool.getUtilizationRate()).to.equal(0);

            // Test after borrowing
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));
            expect(await liquidityPool.getUtilizationRate()).to.be.gt(0);
        });
    });

    describe("LendingManager - Complete Coverage", function () {
        beforeEach(async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(lendingManager.address, ethers.parseEther("10000"));
        });

        it("should handle all collateral operations", async function () {
            // Deposit collateral
            await lendingManager.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("1000")
            );

            // Withdraw collateral
            await lendingManager.connect(borrower1).withdrawCollateral(
                mockToken.address,
                ethers.parseEther("500")
            );

            // Test insufficient withdrawal
            await expect(
                lendingManager.connect(borrower1).withdrawCollateral(
                    mockToken.address,
                    ethers.parseEther("1000")
                )
            ).to.be.revertedWith("Insufficient collateral");
        });

        it("should handle credit score updates", async function () {
            await lendingManager.connect(timelock).updateCreditScore(borrower1.address, 90);
            expect(await liquidityPool.creditScores(borrower1.address)).to.equal(90);

            // Test invalid scores
            await expect(
                lendingManager.connect(timelock).updateCreditScore(borrower1.address, 101)
            ).to.be.revertedWith("Invalid credit score");
        });

        it("should handle liquidation management", async function () {
            // Setup liquidatable position
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("20") });
            await lendingManager.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("100")
            );
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"));

            // Crash price
            await mockPriceFeed.updateAnswer(ethers.parseUnits("100", 8));

            // Test liquidation functions
            await lendingManager.startLiquidation(borrower1.address);
            expect(await liquidityPool.isLiquidatable(borrower1.address)).to.be.true;

            // Test liquidation execution
            await ethers.provider.send("evm_increaseTime", [3 * 24 * 3600 + 1]);
            await lendingManager.executeLiquidation(borrower1.address);
        });

        it("should handle all admin functions", async function () {
            // Test pause
            await lendingManager.connect(timelock).pause();
            expect(await lendingManager.paused()).to.be.true;

            await lendingManager.connect(timelock).unpause();
            expect(await lendingManager.paused()).to.be.false;

            // Test emergency functions
            await mockToken.transfer(lendingManager.address, ethers.parseEther("100"));
            await lendingManager.connect(timelock).emergencyTokenRecovery(
                mockToken.address,
                ethers.parseEther("50")
            );
        });
    });

    describe("StablecoinManager - Complete Coverage", function () {
        it("should handle stablecoin management", async function () {
            // Add stablecoin
            await stablecoinManager.connect(timelock).addStablecoin(
                mockToken.address,
                150, // liquidationThreshold
                120  // borrowThreshold
            );

            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.true;
            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(150);
            expect(await stablecoinManager.borrowThresholds(mockToken.address)).to.equal(120);

            // Update thresholds
            await stablecoinManager.connect(timelock).updateLiquidationThreshold(mockToken.address, 160);
            await stablecoinManager.connect(timelock).updateBorrowThreshold(mockToken.address, 130);

            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(160);
            expect(await stablecoinManager.borrowThresholds(mockToken.address)).to.equal(130);

            // Remove stablecoin
            await stablecoinManager.connect(timelock).removeStablecoin(mockToken.address);
            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.false;
        });

        it("should handle threshold calculations", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 120);

            const liquidationThreshold = await stablecoinManager.getLiquidationThreshold(mockToken.address);
            const borrowThreshold = await stablecoinManager.getBorrowThreshold(mockToken.address);

            expect(liquidationThreshold).to.equal(150);
            expect(borrowThreshold).to.equal(120);

            // Test non-stablecoin
            const defaultLiquidation = await stablecoinManager.getLiquidationThreshold(user1.address);
            const defaultBorrow = await stablecoinManager.getBorrowThreshold(user1.address);

            expect(defaultLiquidation).to.equal(200); // Default values
            expect(defaultBorrow).to.equal(150);
        });

        it("should handle access control", async function () {
            await expect(
                stablecoinManager.connect(user1).addStablecoin(mockToken.address, 150, 120)
            ).to.be.revertedWith("Only timelock");

            await expect(
                stablecoinManager.connect(user1).updateLiquidationThreshold(mockToken.address, 160)
            ).to.be.revertedWith("Only timelock");
        });

        it("should handle edge cases", async function () {
            // Test invalid thresholds
            await expect(
                stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 50, 120)
            ).to.be.revertedWith("Invalid liquidation threshold");

            await expect(
                stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 200)
            ).to.be.revertedWith("Borrow threshold cannot exceed liquidation threshold");

            // Test zero address
            await expect(
                stablecoinManager.connect(timelock).addStablecoin(ethers.ZeroAddress, 150, 120)
            ).to.be.revertedWith("Invalid token address");
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("should handle all revert scenarios", async function () {
            // Test paused contract operations
            await liquidityPool.connect(timelock).togglePause();

            await expect(
                liquidityPool.connect(user1).deposit({ value: ethers.parseEther("1") })
            ).to.be.revertedWith("Contract is paused");

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"))
            ).to.be.revertedWith("Contract is paused");

            // Test zero address validations
            await expect(
                liquidityPool.connect(timelock).setCreditScore(ethers.ZeroAddress, 80)
            ).to.be.revertedWith("Invalid address: zero address");

            // Test invalid amounts
            await expect(
                liquidityPool.connect(user1).withdraw(0)
            ).to.be.revertedWith("Amount must be greater than 0");
        });

        it("should handle reentrancy protection", async function () {
            // Test that locked modifier works
            expect(await liquidityPool.locked()).to.be.false;
        });

        it("should handle circuit breakers", async function () {
            // Test stale oracle detection
            await ethers.provider.send("evm_increaseTime", [2 * 3600]); // 2 hours
            await liquidityPool.checkCircuitBreakers();
            expect(await liquidityPool.paused()).to.be.true;
        });
    });

    describe("Integration Tests", function () {
        it("should handle complete lending cycle", async function () {
            // 1. User deposits funds
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("20") });

            // 2. Borrower deposits collateral
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );

            // 3. Borrower borrows funds
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));

            // 4. Time passes, interest accrues
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 3600]); // 30 days

            // 5. Borrower repays loan
            const debt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: debt });

            // 6. Borrower withdraws collateral
            await liquidityPool.connect(borrower1).withdrawCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );

            // 7. Lender withdraws funds with interest
            const balance = await liquidityPool.lenderBalances(user1.address);
            await liquidityPool.connect(user1).withdraw(balance);

            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0);
            expect(await liquidityPool.collateralBalances(borrower1.address, mockToken.address)).to.equal(0);
        });
    });
});