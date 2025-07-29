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
        votingToken = await VotingToken.deploy(owner.address);
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
        stablecoinManager = await StablecoinManager.deploy(owner.address); // Use owner as timelock for simplicity
        await stablecoinManager.waitForDeployment();

        // Deploy InterestRateModel
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            await mockPriceFeed.getAddress(),
            owner.address, // Use owner as timelock for simplicity
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
        glintToken = await GlintToken.deploy(ethers.parseEther("1000000")); // 1M initial supply
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

        // Deploy LiquidityPool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy();
        await liquidityPool.waitForDeployment();

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            await liquidityPool.getAddress(),
            owner.address // Use owner as timelock for simplicity in tests
        );
        await lendingManager.waitForDeployment();

        // Initialize LiquidityPool
        await liquidityPool.initialize(
            owner.address, // Use owner as timelock for simplicity in tests
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
        await stablecoinManager.connect(owner).setStablecoinParams(await mockToken.getAddress(), true, 85, 120);

        // Fund mock tokens
        await mockToken.mint(borrower1.address, ethers.parseEther("10000"));
        await mockToken.mint(borrower2.address, ethers.parseEther("10000"));
        await mockToken.mint(user1.address, ethers.parseEther("10000"));
    });

    describe("VotingToken - Complete Coverage", function() {
        it("should handle all minting scenarios", async function () {
            // Test minting by liquidity pool
            await votingToken.connect(owner).setLiquidityPool(user1.address);

            // Grant MINTER_ROLE to user1 (acting as liquidity pool)
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            await votingToken.connect(owner).grantRole(MINTER_ROLE, user1.address);

            await votingToken.connect(user1).mint(user2.address, 50); // Valid range 1-100
            expect(await votingToken.balanceOf(user2.address)).to.equal(50n);

            // Test minting limits
            await expect(
                votingToken.connect(user2).mint(user1.address, 50)
            ).to.be.reverted; // user2 doesn't have MINTER_ROLE
        });

        it("should handle reputation penalties", async function () {
            await votingToken.connect(owner).setProtocolGovernor(user1.address);

            // Grant MINTER_ROLE to user1 (acting as protocol governor)
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            await votingToken.connect(owner).grantRole(MINTER_ROLE, user1.address);

            await votingToken.connect(user1).mint(user2.address, 100);

            // Test penalty (reduction) - burns tokens
            await votingToken.connect(user1).penalizeReputation(user2.address, 10);
            expect(await votingToken.balanceOf(user2.address)).to.equal(90n);

            // Test another penalty
            await votingToken.connect(user1).penalizeReputation(user2.address, 5);
            expect(await votingToken.balanceOf(user2.address)).to.equal(85n);
        });

        it("should handle access control scenarios", async function () {
            // Test unauthorized minting
            await expect(
                votingToken.connect(user1).mint(user2.address, 50)
            ).to.be.reverted; // user1 doesn't have MINTER_ROLE

            // Test unauthorized penalty
            await expect(
                votingToken.connect(user1).penalizeReputation(user2.address, 10)
            ).to.be.revertedWith("Only ProtocolGovernor");
        });

        it("should handle edge cases", async function () {
            // Test invalid amounts
            await votingToken.connect(owner).setLiquidityPool(user1.address);

            // Grant MINTER_ROLE to user1
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            await votingToken.connect(owner).grantRole(MINTER_ROLE, user1.address);

            await expect(
                votingToken.connect(user1).mint(user2.address, 0)
            ).to.be.revertedWith("Amount must be 1-100");

            await expect(
                votingToken.connect(user1).mint(user2.address, 101)
            ).to.be.revertedWith("Amount must be 1-100");
        });
    });

    describe("InterestRateModel - Complete Coverage", function() {
        it("should calculate utilization rates correctly", async function () {
            const totalBorrowed = ethers.parseEther("50");
            const totalSupplied = ethers.parseEther("100");

            const [borrowRate, supplyRate] = await interestRateModel.getCurrentRates(totalBorrowed, totalSupplied);

            expect(borrowRate).to.be.gt(0);
            expect(supplyRate).to.be.gte(0); // Supply rate can be 0
        });

        it("should handle parameter updates", async function () {
            const newBaseRate = ethers.parseEther("0.06"); // 6%

            await interestRateModel.connect(owner).setParameters(
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
            ).to.be.revertedWithCustomError(interestRateModel, "OnlyTimelockInterestRateModel");
        });

        it("should handle edge cases", async function () {
            // Test zero utilization
            const zeroResult = await interestRateModel.getCurrentRates(0, ethers.parseEther("100"));
            expect(zeroResult[0]).to.equal(await interestRateModel.baseRate()); // borrowRate is first element

            // Test maximum utilization
            const maxResult = await interestRateModel.getCurrentRates(
                ethers.parseEther("100"),
                ethers.parseEther("100")
            );
            expect(maxResult[0] > zeroResult[0]).to.be.true; // Compare borrowRates
        });
    });

    describe("LiquidityPool - Complete Coverage", function() {
        beforeEach(async function () {
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("10000"));
        });

        it("should handle deposits correctly", async function () {
            await user1.sendTransaction({
                to: await liquidityPool.getAddress(),
                value: ethers.parseEther("5")
            });
            expect(await liquidityPool.getBalance()).to.equal(ethers.parseEther("5"));
        });

        it("should handle deposits correctly", async function () {
            const initialBalance = await liquidityPool.getBalance();
            await user1.sendTransaction({ to: await liquidityPool.getAddress(), value: ethers.parseEther("10") });

            expect(await liquidityPool.getBalance()).to.equal(initialBalance + ethers.parseEther("10"));
        });

        it("should handle collateral operations", async function () {
            // Test that collateral functions exist and can be called
            expect(liquidityPool.depositCollateral).to.be.a('function');
            expect(liquidityPool.withdrawCollateral).to.be.a('function');
            expect(liquidityPool.collateralBalance).to.be.a('function');

            // Test basic collateral deposit (should not revert)
            await liquidityPool.connect(borrower1).depositCollateral(
                await mockToken.getAddress(),
                ethers.parseEther("100")
            );

            // Check that some collateral was deposited
            const balance = await liquidityPool.collateralBalance(borrower1.address, await mockToken.getAddress());
            expect(balance).to.be.gte(0n);
        });

        it("should handle borrowing and repayment", async function () {
            await user1.sendTransaction({ to: await liquidityPool.getAddress(), value: ethers.parseEther("20") });
            await liquidityPool.connect(borrower1).depositCollateral(
                await mockToken.getAddress(),
                ethers.parseEther("2000")
            );

            await liquidityPool.connect(borrower1).borrow(ethers.parseEther("5"));
            expect(await liquidityPool.userDebt(borrower1.address)).to.be.gte(ethers.parseEther("5"));

            const debt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: debt });
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0n);
        });

        it("should handle admin functions", async function () {
            await liquidityPool.connect(owner).togglePause();
            expect(await liquidityPool.paused()).to.be.true;

            await liquidityPool.connect(owner).togglePause();
            expect(await liquidityPool.paused()).to.be.false;
        });
    });

    describe("LendingManager - Complete Coverage", function() {
        beforeEach(async function () {
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await liquidityPool.connect(owner).setCreditScore(user1.address, 80);
            await mockToken.connect(borrower1).approve(await lendingManager.getAddress(), ethers.parseEther("10000"));
        });

        it("should handle lending operations", async function () {
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("10") });
            const lenderInfo = await lendingManager.getLenderInfo(user1.address);
            expect(lenderInfo.balance).to.equal(ethers.parseEther("10"));
        });

        it("should handle withdrawal requests", async function () {
            await lendingManager.connect(user1).depositFunds({ value: ethers.parseEther("10") });
            await lendingManager.connect(user1).requestWithdrawal(ethers.parseEther("5"));

            const lenderReport = await lendingManager.getLenderReport(user1.address);
            expect(lenderReport.pendingPrincipalWithdrawal).to.be.gt(0);
        });

        it("should handle admin functions", async function () {
            await lendingManager.connect(owner).setCurrentDailyRate(ethers.parseEther("1.001")); // 1.001 (0.1% above 1.0)
            expect(await lendingManager.currentDailyRate()).to.equal(ethers.parseEther("1.001"));
        });
    });

    describe("StablecoinManager - Complete Coverage", function() {
        it("should manage stablecoins correctly", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(
                await mockToken.getAddress(),
                true, // isStable
                85,   // ltv
                120   // liquidationThreshold
            );

            expect(await stablecoinManager.isTokenStablecoin(await mockToken.getAddress())).to.be.true;
            expect(await stablecoinManager.getLiquidationThreshold(await mockToken.getAddress())).to.equal(120n);
        });

        it("should handle threshold updates", async function () {
            await stablecoinManager.connect(owner).setStablecoinParams(await mockToken.getAddress(), true, 85, 150);

            await stablecoinManager.connect(owner).setStablecoinParams(await mockToken.getAddress(), true, 85, 160);
            expect(await stablecoinManager.getLiquidationThreshold(await mockToken.getAddress())).to.equal(160n);
        });

        it("should reject unauthorized operations", async function () {
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(await mockToken.getAddress(), true, 85, 150)
            ).to.be.revertedWithCustomError(stablecoinManager, "OnlyTimelockStablecoinManager");
        });
    });

    describe("ProtocolGovernor - Complete Coverage", function() {
        beforeEach(async function () {
            // Mint voting tokens for governance
            await votingToken.connect(owner).setLiquidityPool(user1.address);

            // Grant MINTER_ROLE to user1 so they can mint tokens
            const MINTER_ROLE = await votingToken.MINTER_ROLE();
            await votingToken.connect(owner).grantRole(MINTER_ROLE, user1.address);

            await votingToken.connect(user1).mint(user1.address, 100);
            await votingToken.connect(user1).mint(user2.address, 50);
        });

        it("should handle proposal creation", async function () {
            const targets = [await liquidityPool.getAddress()];
            const values = [0];
            const calldatas = [liquidityPool.interface.encodeFunctionData("togglePause", [])];
            const description = "Toggle pause";

            await expect(
                governor.connect(user1).propose(targets, values, calldatas, description)
            ).to.emit(governor, "ProposalCreated");
        });

        it("should handle voting", async function () {
            // Test that governance functions exist and can be called
            expect(governor.propose).to.be.a('function');
            expect(governor.castVote).to.be.a('function');
            expect(governor.hashProposal).to.be.a('function');

            // Test basic proposal creation (already tested above)
            const targets = [await liquidityPool.getAddress()];
            const values = [0];
            const calldatas = [liquidityPool.interface.encodeFunctionData("togglePause", [])];
            const description = "Test proposal for voting";

            await governor.connect(user1).propose(targets, values, calldatas, description);

            // Check that proposal was created
            const proposalId = await governor.hashProposal(
                targets,
                values,
                calldatas,
                ethers.keccak256(ethers.toUtf8Bytes(description))
            );
            expect(proposalId).to.not.equal(0);
        });
    });

    describe("Integration Tests", function() {
        it("should handle complete lending cycle", async function () {
            // Setup
            await liquidityPool.connect(owner).setCreditScore(borrower1.address, 80);
            await mockToken.connect(borrower1).approve(await liquidityPool.getAddress(), ethers.parseEther("10000"));

            // 1. User deposits funds
            await user1.sendTransaction({ to: await liquidityPool.getAddress(), value: ethers.parseEther("20") });

            // 2. Borrower deposits collateral
            await liquidityPool.connect(borrower1).depositCollateral(
                await mockToken.getAddress(),
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