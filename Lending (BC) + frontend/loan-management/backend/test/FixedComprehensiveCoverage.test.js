const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Fixed Comprehensive Contract Coverage", function() {
    let votingToken, timelock, governor, liquidityPool, lendingManager, stablecoinManager;
    let interestRateModel, glintToken, mockPriceFeed, mockToken;
    let owner, user1, user2, user3, borrower1, borrower2, liquidator;

    beforeEach(async function () {
        [owner, user1, user2, user3, borrower1, borrower2, liquidator] = await ethers.getSigners();

        // Deploy VotingToken with correct constructor
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address); // Pass DAO address
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

        // Deploy MockPriceFeed
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(
            ethers.parseUnits("2000", 8), // $2000 - using ethers v5 syntax
            8
        );
        await mockPriceFeed.waitForDeployment();

        // Deploy MockToken
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock Token", "MOCK");
        await mockToken.waitForDeployment();

        // Deploy StablecoinManager with correct constructor
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(await timelock.getAddress());
        await stablecoinManager.waitForDeployment();

        // Deploy InterestRateModel with all required parameters
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            await mockPriceFeed.getAddress(), // Use mock price feed instead
            await timelock.getAddress(),
            ethers.parseEther("0.05"), // 5% baseRate
            ethers.parseEther("0.8"),   // 80% kink
            ethers.parseEther("0.1"),   // 10% slope1
            ethers.parseEther("0.3"),   // 30% slope2
            ethers.parseEther("0.1"),   // 10% reserveFactor
            ethers.parseEther("1.0"),   // 100% maxBorrowRate
            ethers.parseEther("0.05"),  // 5% maxRateChange
            ethers.parseEther("0.03"),  // 3% ethPriceRiskPremium
            ethers.parseEther("0.2"),   // 20% ethVolatilityThreshold
            86400 // 24h oracleStalenessWindow
        );
        await interestRateModel.waitForDeployment();

        // Deploy GlintToken
        const GlintToken = await ethers.getContractFactory("GlintToken");
        glintToken = await GlintToken.deploy();
        await glintToken.waitForDeployment();

        // Deploy mock contracts for IntegratedCreditSystem
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

        // Deploy LiquidityPool using initialize pattern
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy();
        await liquidityPool.waitForDeployment();

        // Deploy LendingManager first
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            await liquidityPool.getAddress(),
            await timelock.getAddress() // timelock
        );
        await lendingManager.waitForDeployment();

        // Initialize LiquidityPool
        await liquidityPool.initialize(
            await timelock.getAddress(),
            await stablecoinManager.getAddress(),
            await lendingManager.getAddress(),
            await interestRateModel.getAddress(),
            await creditSystem.getAddress()
        );
            ethers.ZeroAddress, // LendingManager placeholder
            interestRateModel.address,
            ethers.ZeroAddress  // CreditSystem placeholder
        );
        await liquidityPool.waitForDeployment();

        // Deploy LendingManager with correct constructor
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            liquidityPool.address,
            votingToken.address
        );
        await lendingManager.waitForDeployment();

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

    describe("VotingToken - Complete Coverage", function() {
        it("should handle all minting scenarios", async function () {
            // Test minting by liquidity pool
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await votingToken.connect(user1).mint(user2.address, 50); // Valid range 1-100
            expect(await votingToken.balanceOf(user2.address)).to.equal(50n);

            // Test minting limits
            await expect(
                votingToken.connect(user2).mint(user1.address, 50)
            ).to.be.revertedWithCustomError("Only LiquidityPool can mint");
        });

        it("should handle reputation penalties", async function () {
            await votingToken.connect(owner).setProtocolGovernor(user1.address);
            await votingToken.connect(user1).mint(user2.address, 100);

            // Test positive penalty (reduction)
            await votingToken.connect(user1).penalizeReputation(user2.address, 10);
            expect(await votingToken.balanceOf(user2.address)).to.equal(90n);

            // Test negative penalty (increase)
            await votingToken.connect(user1).penalizeReputation(user2.address, -20);
            expect(await votingToken.balanceOf(user2.address)).to.equal(110n);
        });

        it("should handle access control scenarios", async function () {
            // Test unauthorized minting
            await expect(
                votingToken.connect(user1).mint(user2.address, 50)
            ).to.be.revertedWithCustomError("Only LiquidityPool can mint");

            // Test unauthorized penalty
            await expect(
                votingToken.connect(user1).penalizeReputation(user2.address, 10)
            ).to.be.revertedWithCustomError("Only ProtocolGovernor can penalize");
        });

        it("should handle edge cases", async function () {
            // Test invalid amounts
            await votingToken.connect(owner).setLiquidityPool(user1.address);

            await expect(
                votingToken.connect(user1).mint(user2.address, 0)
            ).to.be.revertedWithCustomError("Amount must be 1-100");

            await expect(
                votingToken.connect(user1).mint(user2.address, 101)
            ).to.be.revertedWithCustomError("Amount must be 1-100");
        });
    });

    describe("InterestRateModel - Complete Coverage", function() {
        it("should calculate utilization rates correctly", async function () {
            const totalBorrowed = ethers.parseEther("50");
            const totalSupplied = ethers.parseEther("100");

            const result = await interestRateModel.getCurrentRates(totalBorrowed, totalSupplied);

            expect(result.borrowRate > 0).to.be.true;
            expect(result.supplyRate > 0).to.be.true;
        });

        it("should handle parameter updates", async function () {
            const newBaseRate = ethers.parseEther("0.06"); // 6%

            await interestRateModel.connect(timelock).setParameters(
                newBaseRate,
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

            expect(await interestRateModel.baseRate()).to.equal(newBaseRate);
        });

        it("should reject unauthorized parameter updates", async function () {
            await expect(
                interestRateModel.connect(user1).setParameters(
                    ethers.parseEther("0.06"),
                    ethers.parseEther("0.8"),
                    ethers.parseEther("0.1"),
                    ethers.parseEther("0.3"),
                    ethers.parseEther("0.1"),
                    ethers.parseEther("1.0"),
                    ethers.parseEther("0.05"),
                    ethers.parseEther("0.03"),
                    ethers.parseEther("0.2"),
                    86400
                )
            ).to.be.revertedWithCustomError("Only timelock");
        });

        it("should handle edge cases", async function () {
            // Test zero utilization
            const zeroResult = await interestRateModel.getCurrentRates(0, ethers.parseEther("100"));
            expect(zeroResult.borrowRate).to.equal(await interestRateModel.baseRate());

            // Test maximum utilization
            const maxResult = await interestRateModel.getCurrentRates(
                ethers.parseEther("100"),
                ethers.parseEther("100")
            );
            expect(maxResult.borrowRate > zeroResult.borrowRate).to.be.true;
        });
    });

    describe("LiquidityPool - Complete Coverage", function() {
        beforeEach(async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.parseEther("10000"));
        });

        it("should handle deposits correctly", async function () {
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.parseEther("5")
            });
            expect(await liquidityPool.getBalance()).to.equal(ethers.parseEther("5"));
        });

        it("should handle withdrawals correctly", async function () {
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("10") });

            await liquidityPool.connect(user1).withdraw(ethers.parseEther("3"));
            expect(await liquidityPool.lenderBalances(user1.address)).to.equal(ethers.parseEther("7"));
        });

        it("should handle collateral operations", async function () {
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("1000")
            );

            expect(await liquidityPool.collateralBalances(borrower1.address, mockToken.address))
                .to.equal(ethers.parseEther("1000"));
        });

        it("should handle borrowing and repayment", async function () {
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );

            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));
            expect((await liquidityPool.userDebt(borrower1.address)).gt(ethers.parseEther("5"))).to.be.true;

            const debt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: debt });
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0n);
        });

        it("should handle admin functions", async function () {
            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.true;

            await liquidityPool.connect(timelock).togglePause();
            expect(await liquidityPool.paused()).to.be.false;
        });
    });

    describe("LendingManager - Complete Coverage", function() {
        beforeEach(async function () {
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(lendingManager.address, ethers.parseEther("10000"));
        });

        it("should handle lending operations", async function () {
            await lendingManager.connect(user1).lend({ value: ethers.parseEther("10") });
            expect(await lendingManager.lenderBalances(user1.address)).to.equal(ethers.parseEther("10"));
        });

        it("should handle withdrawal requests", async function () {
            await lendingManager.connect(user1).lend({ value: ethers.parseEther("10") });
            await lendingManager.connect(user1).requestWithdrawal(ethers.parseEther("5"));

            expect((await lendingManager.withdrawalRequests(user1.address)).gt(0)).to.be.true;
        });

        it("should handle admin functions", async function () {
            await lendingManager.connect(owner).setCurrentDailyRate(ethers.parseEther("0.001")); // 0.1%
            expect(await lendingManager.currentDailyRate()).to.equal(ethers.parseEther("0.001"));
        });
    });

    describe("StablecoinManager - Complete Coverage", function() {
        it("should manage stablecoins correctly", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(
                mockToken.address,
                150, // liquidationThreshold
                120  // borrowThreshold
            );

            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.true;
            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(150n);
        });

        it("should handle threshold updates", async function () {
            await stablecoinManager.connect(timelock).addStablecoin(mockToken.address, 150, 120);

            await stablecoinManager.connect(timelock).updateLiquidationThreshold(mockToken.address, 160);
            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(160n);
        });

        it("should reject unauthorized operations", async function () {
            await expect(
                stablecoinManager.connect(user1).addStablecoin(mockToken.address, 150, 120)
            ).to.be.revertedWithCustomError("Only timelock");
        });
    });

    describe("ProtocolGovernor - Complete Coverage", function() {
        beforeEach(async function () {
            // Mint voting tokens for governance
            await votingToken.connect(owner).setLiquidityPool(user1.address);
            await votingToken.connect(user1).mint(user1.address, 100);
            await votingToken.connect(user1).mint(user2.address, 50);
        });

        it("should handle proposal creation", async function () {
            const targets = [liquidityPool.address];
            const values = [0];
            const calldatas = [liquidityPool.interface.encodeFunctionData("togglePause", [])];
            const description = "Toggle pause";

            await expect(
                governor.connect(user1).propose(targets, values, calldatas, description)
            ).to.emit(governor, "ProposalCreated");
        });

        it("should handle voting", async function () {
            const targets = [liquidityPool.address];
            const values = [0];
            const calldatas = [liquidityPool.interface.encodeFunctionData("togglePause", [])];
            const description = "Test proposal";

            await governor.connect(user1).propose(targets, values, calldatas, description);
            const proposalId = await governor.hashProposal(
                targets,
                values,
                calldatas,
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(description))
            );

            await ethers.provider.send("evm_mine");

            await expect(
                governor.connect(user1).castVote(proposalId, 1)
            ).to.emit(governor, "VoteCast");
        });
    });

    describe("Integration Tests", function() {
        it("should handle complete lending cycle", async function () {
            // Setup
            await liquidityPool.connect(timelock).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(liquidityPool.address, ethers.parseEther("10000"));

            // 1. User deposits funds
            await liquidityPool.connect(user1).deposit({ value: ethers.parseEther("20") });

            // 2. Borrower deposits collateral
            await liquidityPool.connect(borrower1).depositCollateral(
                mockToken.address,
                ethers.parseEther("2000")
            );

            // 3. Borrower borrows funds
            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));

            // 4. Borrower repays loan
            const debt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: debt });

            // 5. Verify final state
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0n);
        });
    });
});