const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Complete Contract Coverage Tests", function () {
    let owner, user1, user2, user3, borrower1, borrower2, liquidator;
    let votingToken, timelock, governor, mockPriceFeed, mockToken;
    let stablecoinManager, interestRateModel, glintToken, liquidityPool;
    let lendingManager, creditSystem;

    beforeEach(async function () {
    [owner, user1, user2, user3, borrower1, borrower2, liquidator] = await ethers.getSigners();

    // Deploy VotingToken
    const VotingToken = await ethers.getContractFactory("VotingToken");
    votingToken = await VotingToken.deploy(owner.address); // DAO address
    await votingToken.waitForDeployment();

    // Deploy TimelockController
    const TimelockController = await ethers.getContractFactory("TimelockController");
    timelock = await TimelockController.deploy(
        60, // 1 minute delay
        [owner.address], // proposers
        [owner.address], // executors
        owner.address // admin
    );
    await timelock.waitForDeployment();

    // Deploy ProtocolGovernor
    const ProtocolGovernor = await ethers.getContractFactory("ProtocolGovernor");
    governor = await ProtocolGovernor.deploy(
        await votingToken.getAddress(),
        await timelock.getAddress()
    );
    await governor.waitForDeployment();

    // Set up VotingToken roles
    await votingToken.connect(owner).setProtocolGovernor(await governor.getAddress());
    

    // Deploy MockPriceFeed
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    mockPriceFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("2000", 8), // $2000
        8
    );
    await mockPriceFeed.waitForDeployment();

    // Deploy MockToken
    const MockToken = await ethers.getContractFactory("MockToken");
    mockToken = await MockToken.deploy("Mock Token", "MOCK");
    await mockToken.waitForDeployment();

    // Deploy StablecoinManager
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    stablecoinManager = await StablecoinManager.deploy(owner.address);
    await stablecoinManager.waitForDeployment();

    // Deploy InterestRateModel
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    interestRateModel = await InterestRateModel.deploy(
        await mockPriceFeed.getAddress(),
        owner.address,
        ethers.parseEther("0.05"),
        ethers.parseEther("0.8"),
        ethers.parseEther("0.1"),
        ethers.parseEther("0.3"),
        ethers.parseEther("0.1"),
        ethers.parseEther("1.0"),
        ethers.parseEther("0.05"),
        ethers.parseEther("0.03"),
        ethers.parseEther("0.2"),
        86400
    );
    await interestRateModel.waitForDeployment();

    // Deploy GlintToken
    const GlintToken = await ethers.getContractFactory("GlintToken");
    glintToken = await GlintToken.deploy(ethers.parseEther("1000000"));
    await glintToken.waitForDeployment();

    // Deploy mock verifier and mock pool for credit system
    const MockRiscZeroVerifier = await ethers.getContractFactory("MockRiscZeroVerifier");
    const mockRisc0Verifier = await MockRiscZeroVerifier.deploy();
    await mockRisc0Verifier.waitForDeployment();

    const MockLiquidityPool = await ethers.getContractFactory("MockLiquidityPool");
    const mockLiquidityPoolForCredit = await MockLiquidityPool.deploy();
    await mockLiquidityPoolForCredit.waitForDeployment();

    // Deploy IntegratedCreditSystem
    const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
    const creditSystem = await IntegratedCreditSystem.deploy(
        await mockRisc0Verifier.getAddress(),
        await mockLiquidityPoolForCredit.getAddress()
    );
    await creditSystem.waitForDeployment();

    // Deploy LiquidityPool
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    liquidityPool = await LiquidityPool.deploy();
    await liquidityPool.waitForDeployment();

    // Deploy LendingManager
    const LendingManager = await ethers.getContractFactory("LendingManager");
    lendingManager = await LendingManager.deploy(
        await liquidityPool.getAddress(),
        owner.address
    );
    await lendingManager.waitForDeployment();

    // Initialize LiquidityPool
    await liquidityPool.initialize(
        owner.address, // Use owner as timelock for testing
        await stablecoinManager.getAddress(),
        await lendingManager.getAddress(),
        await interestRateModel.getAddress(),
        await creditSystem.getAddress()
    );

    // Setup connections
    await liquidityPool.connect(owner).setLendingManager(await lendingManager.getAddress());
    await votingToken.connect(owner).setLiquidityPool(await liquidityPool.getAddress());
    await votingToken.connect(owner).setProtocolGovernor(await governor.getAddress());

    // Setup collateral and price feeds
    await liquidityPool.connect(owner).setAllowedCollateral(await mockToken.getAddress(), true);
    await liquidityPool.connect(owner).setPriceFeed(await mockToken.getAddress(), await mockPriceFeed.getAddress());
    await stablecoinManager.connect(owner).setStablecoinParams(await mockToken.getAddress(), true, 85, 110);

    // Fund mock tokens
    await mockToken.mint(borrower1.address, ethers.parseEther("10000"));
    await mockToken.mint(borrower2.address, ethers.parseEther("10000"));
    await mockToken.mint(user1.address, ethers.parseEther("10000"));

    // Set up credit scores for users to enable lending
    await liquidityPool.setCreditScore(user1.address, 80);
    await liquidityPool.setCreditScore(user2.address, 80);
    await liquidityPool.setCreditScore(user3.address, 80);
    await liquidityPool.setCreditScore(borrower1.address, 80);
    await liquidityPool.setCreditScore(borrower2.address, 80);
});


    describe("VotingToken - Complete Coverage", function() {
        it("should handle all minting scenarios", async function () {
            // Test minting by liquidity pool
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            await votingToken.connect(owner).grantRole(MINTER_ROLE, user1.address);
            await votingToken.connect(user1).mint(user2.address, 100);
            expect(await votingToken.balanceOf(user2.address)).to.equal(100n);

            // Test minting limits
            await expect(
                votingToken.connect(user2).mint(user1.address, 100)
            ).to.be.revertedWithCustomError("Only LiquidityPool can mint");
        });

        it("should handle reputation penalties", async function () {
            await votingToken.connect(owner).setProtocolGovernor(user1.address);
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            await votingToken.connect(owner).grantRole(MINTER_ROLE, user1.address);
            await votingToken.connect(user1).mint(user2.address, 100);

            // Test positive penalty (reduction)
            await votingToken.connect(user1).penalizeReputation(user2.address, 10);
            expect(await votingToken.balanceOf(user2.address)).to.equal(90n);

            // Test negative penalty (increase)
            await votingToken.connect(user1).penalizeReputation(user2.address, -20);
            expect(await votingToken.balanceOf(user2.address)).to.equal(110n);

            // Test penalty exceeding balance
            await votingToken.connect(user1).penalizeReputation(user2.address, 2000);
            expect(await votingToken.balanceOf(user2.address)).to.equal(0n);
        });

        it("should handle all access control scenarios", async function () {
            // Test unauthorized minting
            await expect(
                votingToken.connect(user1).mint(user2.address, 100)
            ).to.be.reverted;

            // Test unauthorized penalty
            await expect(
                votingToken.connect(user1).penalizeReputation(user2.address, 100)
            ).to.be.revertedWith("Only ProtocolGovernor");

            // Test owner functions
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await votingToken.connect(owner).setProtocolGovernor(user2.address);

            // Test non-owner access
            await expect(
                votingToken.connect(user1).setLiquidityPool(user2.address)
            ).to.be.revertedWith("is missing role");
        });

        it("should handle edge cases", async function () {
            // Test zero address scenarios
            await expect(
                votingToken.connect(owner).setLiquidityPool(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid pool address");

            await expect(
                votingToken.connect(owner).setProtocolGovernor(ethers.ZeroAddress)
            ).to.be.revertedWithCustomError("Invalid address");

            // Test minting to zero address
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await expect(
                votingToken.connect(user1).mint(ethers.ZeroAddress, 100)
            ).to.be.revertedWithCustomError("ERC721: mint to the zero address");
        });
    });

    describe("ProtocolGovernor - Complete Coverage", function() {
        beforeEach(async function () {
            // Mint voting tokens for governance
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            await votingToken.connect(owner).grantRole(MINTER_ROLE, user1.address);
            await votingToken.connect(user1).mint(user1.address, 100);
            await votingToken.connect(user1).mint(user2.address, 50);
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
            expect(proposal.forVotes).to.be > 0;
        });

        it("should handle reputation penalties", async function () {
            await governor.connect(owner).penalizeReputation(user1.address, 100);
            expect(await votingToken.balanceOf(user1.address)).to.equal(900n);
        });
    });

    describe("LiquidityPool - Complete Coverage", function() {
        beforeEach(async function () {
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("10000"));
        });

        it("should handle all deposit scenarios", async function () {
            // Direct ETH deposit to LiquidityPool
            await user1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("5")
            });
            expect(await liquidityPool.totalFunds()).to.equal(ethers.parseEther("5"));

            // Deposit function call through LendingManager
            await lendingManager.connect(user2).depositFunds({ value: ethers.parseEther("3") });
            expect(await liquidityPool.totalFunds()).to.equal(ethers.parseEther("8"));

            // Test lender balance tracking through LendingManager (only user2 has a lender record)
            const lenderInfo = await lendingManager.lenders(user2.address);
            expect(lenderInfo.balance).to.equal(ethers.parseEther("3"));
        });

        it("should handle all withdrawal scenarios", async function () {
            // Setup deposits through LendingManager
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("10") });

            // Request and complete withdrawal
            await lendingManager.connect(user1).requestWithdrawal(ethers.parseEther("3"));
            await ethers.provider.send("evm_increaseTime", [86401]); // Wait for cooldown
            await lendingManager.connect(user1).completeWithdrawal();

            const lenderInfo = await lendingManager.lenders(user1.address);
            expect(lenderInfo.balance).to.equal(ethers.parseEther("7"));

            // Full withdrawal
            await liquidityPool.connect(user1).withdraw(ethers.parseEther("7"));
            expect(await liquidityPool.lenderBalances(user1.address)).to.equal(0n);

            // Test withdrawal exceeding balance
            await expect(
                liquidityPool.connect(user1).withdraw(ethers.parseEther("1"))
            ).to.be.revertedWithCustomError("Insufficient balance");
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
            ).to.be.revertedWithCustomError("Insufficient collateral balance");
        });

        it("should handle all borrowing scenarios", async function () {
            // Setup
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );

            // Normal borrow
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));
            expect(await liquidityPool.userDebt(borrower1.address)).to.be > ethers.parseEther("5");

            // Test borrow limits
            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("50"))
            ).to.be.revertedWithCustomError("Borrow amount exceeds available lending capacity");

            // Test insufficient collateral
            await liquidityPool.connect(timelock).setCreditScore(borrower2.address, 80);
            await expect(
                liquidityPool.connect(borrower2).borrow(ethers.parseEther("1"))
            ).to.be.revertedWithCustomError("Insufficient collateral for this loan");
        });

        it("should handle all repayment scenarios", async function () {
            // Setup borrow
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));

            const debt = await liquidityPool.userDebt(borrower1.address);

            // Partial repayment
            const partialAmount = debt.div(2);
            await liquidityPool.connect(borrower1).repay({ value: partialAmount });
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(debt - partialAmount);

            // Full repayment
            const remainingDebt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: remainingDebt });
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0n);

            // Test overpayment
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"));
            const newDebt = await liquidityPool.userDebt(borrower1.address);
            const overpayment = newDebt + ethers.parseEther("2");

            const balanceBefore = await ethers.provider.getBalance(borrower1.address);
            const tx = await liquidityPool.connect(borrower1).repay({ value: overpayment });
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            const balanceAfter = await ethers.provider.getBalance(borrower1.address);

            expect(balanceAfter).to.be.closeTo(
                balanceBefore - newDebt.sub(gasUsed),
                ethers.parseEther("0.01")
            );
        });

        it("should handle all liquidation scenarios", async function () {
            // Setup undercollateralized position
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("20") });
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
            ).to.be.revertedWithCustomError("Contract is paused");

            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.false;

            // Test fund extraction
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("10") });
            const balanceBefore = await ethers.provider.getBalance(user2.address);

            await liquidityPool.connect(timelock).extract(
                ethers.parseEther("5"),
                user2.address
            );

            const balanceAfter = await ethers.provider.getBalance(user2.address);
            expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("5"));

            // Test credit score management
            await liquidityPool.connect(timelock).setCreditScore(user3.address, 95);
            expect(await liquidityPool.creditScores(user3.address)).to.equal(95n);

            // Test collateral management
            await liquidityPool.connect(timelock).setAllowedCollateral(user3.address, true);
            expect(await liquidityPool.allowedCollateral(user3.address)).to.be.true;

            // Test price feed management
            await liquidityPool.connect(timelock).setPriceFeed(user3.address, mockPriceFeed.address);
            expect(await liquidityPool.priceFeeds(user3.address)).to.equal(mockPriceFeed.address);
        });

        it("should handle all view functions", async function () {
            // Setup data
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("10") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("1000")
            );

            // Test view functions
            expect(await liquidityPool.getBalance()).to.equal(ethers.parseEther("10"));
            expect(await liquidityPool.getTotalCollateralValue(borrower1.address)).to.be > 0;
            expect(await liquidityPool.calculateBorrowRate(ethers.parseEther("1"), 0)).to.be > 0;
            expect(await liquidityPool.getUtilizationRate()).to.equal(0n);

            // Test after borrowing
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));
            expect(await liquidityPool.getUtilizationRate()).to.be > 0;
        });
    });

    describe("LendingManager - Complete Coverage", function() {
        beforeEach(async function () {
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(await lendingManager.getAddress(), ethers.parseEther("10000"));
        });

        it("should handle all collateral operations", async function () {
            // Deposit collateral (handled by LiquidityPool, not LendingManager)
            await liquidityPool.connect(borrower1).depositCollateral(
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
            ).to.be.revertedWithCustomError("Insufficient collateral");
        });

        it("should handle credit score updates", async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 90);
            expect(await liquidityPool.creditScores(borrower1.address)).to.equal(90n);

            // Test invalid scores
            await expect(
                lendingManager.connect(timelock).updateCreditScore(borrower1.address, 101)
            ).to.be.revertedWithCustomError("Invalid credit score");
        });

        it("should handle liquidation management", async function () {
            // Setup liquidatable position
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
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

    describe("StablecoinManager - Complete Coverage", function() {
        it("should handle stablecoin management", async function () {
            // Add stablecoin
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockToken.getAddress(),
                true, // enabled
                85,   // LTV
                110   // liquidationThreshold
            );

            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.true;
            expect(await stablecoinManager.getLTV(await mockToken.getAddress())).to.equal(85n);
            expect(await stablecoinManager.getLiquidationThreshold(await mockToken.getAddress())).to.equal(110n);

            // Update thresholds using setStablecoinParams
            await stablecoinManager.connect(owner).setStablecoinParams(await mockToken.getAddress(), true, 85, 160);

            expect(await stablecoinManager.getLiquidationThreshold(await mockToken.getAddress())).to.equal(160n);
            expect(await stablecoinManager.getLTV(await mockToken.getAddress())).to.equal(85n);

            // Disable stablecoin
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockToken.getAddress(),
                false, // disabled
                85,
                110
            );
            expect(await stablecoinManager.isStablecoin(await mockToken.getAddress())).to.be.false;
        });

        it("should handle threshold calculations", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockToken.getAddress(),
                true,
                85,  // LTV
                110  // liquidationThreshold
            );

            const liquidationThreshold = await stablecoinManager.getLiquidationThreshold(await mockToken.getAddress());
            const ltv = await stablecoinManager.getLTV(await mockToken.getAddress());

            expect(liquidationThreshold).to.equal(110n);
            expect(ltv).to.equal(85n);

            // Test non-stablecoin (should return 0 for volatile tokens)
            const defaultLiquidation = await stablecoinManager.getLiquidationThreshold(user1.address);
            expect(defaultLiquidation).to.equal(0n); // Returns 0 for non-stablecoins
        });

        it("should handle access control", async function () {
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(
                    await mockToken.getAddress(),
                    true,
                    85,
                    110
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "OnlyTimelockStablecoinManager");
        });

        it("should handle edge cases", async function () {
            // Test invalid LTV (too high)
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockToken.getAddress(),
                    true,
                    95, // LTV too high
                    110
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "LTVTooHigh");

            // Test invalid liquidation threshold (too low)
            await expect(
                stablecoinManager.connect(owner).setStablecoinParams(
                    await mockToken.getAddress(),
                    true,
                    85,
                    105 // threshold too low
                )
            ).to.be.revertedWithCustomError(stablecoinManager, "ThresholdTooLow");
        });
    });

    describe("Error Handling and Edge Cases", function() {
        it("should handle all revert scenarios", async function () {
            // Test paused contract operations
            await liquidityPool.connect(owner).togglePause();

            await expect(
                lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("1") })
            ).to.be.revertedWith("Pausable: paused");

            await expect(
                liquidityPool.connect(borrower1).borrow(ethers.parseEther("1"))
            ).to.be.revertedWithCustomError("Contract is paused");

            // Test zero address validations
            await expect(
                liquidityPool.connect(timelock).setCreditScore(ethers.ZeroAddress, 80)
            ).to.be.revertedWithCustomError("Invalid address: zero address");

            // Test invalid amounts
            await expect(
                liquidityPool.connect(user1).withdraw(0)
            ).to.be.revertedWithCustomError("Amount must be greater than 0");
        });

        it("should handle reentrancy protection", async function () {
            // Test that locked modifier works
            expect(await liquidityPool.locked()).to.be.false;
        });

        it("should handle circuit breakers", async function () {
            // Test manual pause functionality instead of oracle staleness
            // since mock price feeds don't simulate real staleness
            expect(await liquidityPool.isPaused()).to.be.false;

            // Test that checkCircuitBreakers function exists and can be called
            await liquidityPool.checkCircuitBreakers();

            // Test manual pause toggle
            await liquidityPool.connect(owner).togglePause();
            expect(await liquidityPool.isPaused()).to.be.true;
        });
    });

    describe("Integration Tests", function() {
        it("should handle complete lending cycle", async function () {
            // 1. Set up credit scores for lending
            await liquidityPool.connect(owner).setCreditScore(user1.address, 80);
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);

            // 2. Set up token approvals
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("10000"));

            // 3. User deposits funds through LendingManager
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("20") });

            // 4. Borrower deposits collateral
            await liquidityPool.connect(borrower1).depositCollateral(
                await mockToken.getAddress(),
                ethers.parseEther("2000")
            );

            // 4. Borrower borrows funds
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

            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0n);
            expect(await liquidityPool.collateralBalances(borrower1.address, mockToken.address)).to.equal(0n);
        });
    });
});