const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Complete Contract Coverage Tests", function () {
    let liquidityPool, lendingManager, stablecoinManager, interestRateModel, votingToken, glintToken, creditSystem;
    let timelock, protocolGovernor;
    let deployer, user1, user2, user3, borrower1, borrower2, lender1, lender2;
    let mockPriceFeed, mockToken;

    beforeEach(async function () {
        [deployer, user1, user2, user3, borrower1, borrower2, lender1, lender2] = await ethers.getSigners();

        // Deploy mock contracts first
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockToken = await MockERC20.deploy("Mock Token", "MOCK", 18);
        await mockToken.deployed();

        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(ethers.utils.parseUnits("1", 8), 8);
        await mockPriceFeed.deployed();

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
            mockPriceFeed.address, // ETH/USD feed
            deployer.address,
            ethers.utils.parseEther("0.05"), // baseRate
            ethers.utils.parseEther("0.8"),  // optimalUtilization
            ethers.utils.parseEther("0.1"),  // slope1
            ethers.utils.parseEther("0.3"),  // slope2
            ethers.utils.parseEther("0.1"),  // reserveFactor
            ethers.utils.parseEther("1.0"),  // liquidationIncentive
            ethers.utils.parseEther("0.05"), // liquidationThreshold
            ethers.utils.parseEther("0.03"), // borrowThreshold
            ethers.utils.parseEther("0.2"),  // maxLTV
            86400 // updateInterval
        );
        await interestRateModel.deployed();

        // Deploy IntegratedCreditSystem
        const IntegratedCreditSystem = await ethers.getContractFactory("IntegratedCreditSystem");
        creditSystem = await IntegratedCreditSystem.deploy(deployer.address);
        await creditSystem.deployed();

        // Deploy LiquidityPool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy(
            deployer.address,
            stablecoinManager.address,
            votingToken.address,
            interestRateModel.address,
            creditSystem.address
        );
        await liquidityPool.deployed();

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            liquidityPool.address,
            interestRateModel.address,
            deployer.address,
            86400
        );
        await lendingManager.deployed();

        // Set up connections
        await liquidityPool.setLendingManager(lendingManager.address);
        await votingToken.setLiquidityPool(liquidityPool.address);

        // Deploy GlintToken
        const GlintToken = await ethers.getContractFactory("GlintToken");
        glintToken = await GlintToken.deploy(ethers.utils.parseEther("1000000"));
        await glintToken.deployed();

        // Set up collateral and price feeds
        await liquidityPool.setAllowedCollateral(glintToken.address, true);
        await liquidityPool.setPriceFeed(glintToken.address, mockPriceFeed.address);
        await liquidityPool.setAllowedCollateral(mockToken.address, true);
        await liquidityPool.setPriceFeed(mockToken.address, mockPriceFeed.address);

        // Set credit scores for all users
        const users = [user1, user2, user3, borrower1, borrower2, lender1, lender2];
        for (const user of users) {
            await liquidityPool.setCreditScore(user.address, 80);
        }

        // Fund the pool
        await deployer.sendTransaction({
            to: liquidityPool.address,
            value: ethers.utils.parseEther("100")
        });
    });

    describe("VotingToken Complete Coverage", function () {
        it("should cover all VotingToken functions", async function () {
            // Test constructor and initialization
            expect(await votingToken.name()).to.equal("Governance Token");
            expect(await votingToken.symbol()).to.equal("GOV");

            // Test setLiquidityPool
            await votingToken.setLiquidityPool(liquidityPool.address);
            expect(await votingToken.liquidityPool()).to.equal(liquidityPool.address);

            // Test mint function
            await votingToken.mint(user1.address, 50);
            expect(await votingToken.balanceOf(user1.address)).to.equal(50);

            // Test getVotes
            expect(await votingToken.getVotes(user1.address)).to.equal(50);

            // Test transferFrom override (should revert)
            await expect(
                votingToken.connect(user1).transferFrom(user1.address, user2.address, 10)
            ).to.be.revertedWith("Soulbound: non-transferable");

            // Test penalizeReputation function
            await votingToken.penalizeReputation(user1.address, 20);
            expect(await votingToken.balanceOf(user1.address)).to.equal(30);

            // Test edge cases
            await expect(
                votingToken.connect(user1).mint(user2.address, 50)
            ).to.be.revertedWith("Only LiquidityPool can mint");

            await expect(
                votingToken.connect(user1).setLiquidityPool(user2.address)
            ).to.be.revertedWith("Only DAO");

            await expect(
                votingToken.connect(user1).penalizeReputation(user2.address, 10)
            ).to.be.revertedWith("Only ProtocolGovernor can penalize");
        });

        it("should handle mint edge cases", async function () {
            await expect(
                votingToken.mint(ethers.constants.AddressZero, 50)
            ).to.be.revertedWith("Invalid address");

            await expect(
                votingToken.mint(user1.address, 0)
            ).to.be.revertedWith("Amount must be 1-100");

            await expect(
                votingToken.mint(user1.address, 101)
            ).to.be.revertedWith("Amount must be 1-100");
        });

        it("should handle penalize edge cases", async function () {
            await votingToken.mint(user1.address, 30);

            await expect(
                votingToken.penalizeReputation(ethers.constants.AddressZero, 10)
            ).to.be.revertedWith("Invalid address");

            // Penalize more than balance
            await votingToken.penalizeReputation(user1.address, 50);
            expect(await votingToken.balanceOf(user1.address)).to.equal(0);

            // Penalize when no tokens
            await expect(
                votingToken.penalizeReputation(user2.address, 10)
            ).to.be.revertedWith("No tokens to penalize");
        });
    });

    describe("StablecoinManager Complete Coverage", function () {
        it("should cover all StablecoinManager functions", async function () {
            // Test constructor
            expect(await stablecoinManager.timelock()).to.equal(deployer.address);

            // Test setStablecoinParams
            await expect(
                stablecoinManager.setStablecoinParams(mockToken.address, true, 85, 110)
            ).to.emit(stablecoinManager, "StablecoinParamsUpdated");

            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.true;
            expect(await stablecoinManager.stablecoinLTV(mockToken.address)).to.equal(85);
            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(110);

            // Test updateStablecoinStatus
            await stablecoinManager.updateStablecoinStatus(mockToken.address, false);
            expect(await stablecoinManager.isStablecoin(mockToken.address)).to.be.false;

            // Test updateLTV
            await stablecoinManager.updateStablecoinStatus(mockToken.address, true);
            await stablecoinManager.updateLTV(mockToken.address, 80);
            expect(await stablecoinManager.stablecoinLTV(mockToken.address)).to.equal(80);

            // Test updateLiquidationThreshold
            await stablecoinManager.updateLiquidationThreshold(mockToken.address, 115);
            expect(await stablecoinManager.liquidationThresholds(mockToken.address)).to.equal(115);

            // Test getStablecoinInfo
            const info = await stablecoinManager.getStablecoinInfo(mockToken.address);
            expect(info.isStablecoin).to.be.true;
            expect(info.ltv).to.equal(80);
            expect(info.liquidationThreshold).to.equal(115);
        });

        it("should handle StablecoinManager access control", async function () {
            await expect(
                stablecoinManager.connect(user1).setStablecoinParams(mockToken.address, true, 85, 110)
            ).to.be.revertedWith("Only timelock");

            await expect(
                stablecoinManager.connect(user1).updateStablecoinStatus(mockToken.address, false)
            ).to.be.revertedWith("Only timelock");

            await expect(
                stablecoinManager.connect(user1).updateLTV(mockToken.address, 80)
            ).to.be.revertedWith("Only timelock");

            await expect(
                stablecoinManager.connect(user1).updateLiquidationThreshold(mockToken.address, 115)
            ).to.be.revertedWith("Only timelock");
        });

        it("should handle StablecoinManager validation", async function () {
            // Invalid LTV
            await expect(
                stablecoinManager.setStablecoinParams(mockToken.address, true, 95, 110)
            ).to.be.revertedWith("LTV exceeds maximum");

            // Invalid liquidation threshold
            await expect(
                stablecoinManager.setStablecoinParams(mockToken.address, true, 85, 105)
            ).to.be.revertedWith("Liquidation threshold too low");

            // Zero address
            await expect(
                stablecoinManager.setStablecoinParams(ethers.constants.AddressZero, true, 85, 110)
            ).to.be.revertedWith("Invalid token address");
        });
    });

    describe("LiquidityPool Complete Coverage", function () {
        beforeEach(async function () {
            // Set up collateral for users
            await glintToken.transfer(user1.address, ethers.utils.parseEther("1000"));
            await glintToken.connect(user1).approve(liquidityPool.address, ethers.utils.parseEther("1000"));
            await liquidityPool.connect(user1).depositCollateral(glintToken.address, ethers.utils.parseEther("200"));
        });

        it("should cover all LiquidityPool functions", async function () {
            // Test receive function
            const initialBalance = await liquidityPool.getBalance();
            await user1.sendTransaction({
                to: liquidityPool.address,
                value: ethers.utils.parseEther("1")
            });
            expect(await liquidityPool.getBalance()).to.equal(initialBalance.add(ethers.utils.parseEther("1")));

            // Test borrow
            await expect(
                liquidityPool.connect(user1).borrow(ethers.utils.parseEther("0.5"))
            ).to.emit(liquidityPool, "Borrowed");

            // Test repay
            const debt = await liquidityPool.userDebt(user1.address);
            await expect(
                liquidityPool.connect(user1).repay({ value: debt })
            ).to.emit(liquidityPool, "Repaid");

            // Test depositCollateral
            await glintToken.transfer(user2.address, ethers.utils.parseEther("100"));
            await glintToken.connect(user2).approve(liquidityPool.address, ethers.utils.parseEther("100"));
            await expect(
                liquidityPool.connect(user2).depositCollateral(glintToken.address, ethers.utils.parseEther("100"))
            ).to.emit(liquidityPool, "CollateralDeposited");

            // Test withdrawCollateral
            await expect(
                liquidityPool.connect(user2).withdrawCollateral(glintToken.address, ethers.utils.parseEther("50"))
            ).to.emit(liquidityPool, "CollateralWithdrawn");

            // Test admin functions
            await liquidityPool.setAllowedCollateral(mockToken.address, true);
            expect(await liquidityPool.allowedCollateral(mockToken.address)).to.be.true;

            await liquidityPool.setPriceFeed(mockToken.address, mockPriceFeed.address);
            expect(await liquidityPool.priceFeeds(mockToken.address)).to.equal(mockPriceFeed.address);

            await liquidityPool.setCreditScore(user3.address, 90);
            expect(await liquidityPool.creditScores(user3.address)).to.equal(90);

            // Test view functions
            expect(await liquidityPool.getTotalCollateralValue(user1.address)).to.be.gt(0);
            expect(await liquidityPool.getBorrowTerms(user1.address)).to.not.be.undefined;
            expect(await liquidityPool.checkCollateralization(user1.address)).to.not.be.undefined;

            // Test pause functionality
            await liquidityPool.togglePause();
            expect(await liquidityPool.paused()).to.be.true;
            await liquidityPool.togglePause();
            expect(await liquidityPool.paused()).to.be.false;
        });

        it("should handle LiquidityPool edge cases", async function () {
            // Test borrow with insufficient collateral
            await expect(
                liquidityPool.connect(user2).borrow(ethers.utils.parseEther("1"))
            ).to.be.revertedWith("Insufficient collateral for this loan");

            // Test borrow with low credit score
            await liquidityPool.setCreditScore(user1.address, 40);
            await expect(
                liquidityPool.connect(user1).borrow(ethers.utils.parseEther("0.1"))
            ).to.be.revertedWith("Credit score too low");

            // Test repay overpayment
            await liquidityPool.setCreditScore(user1.address, 80);
            await liquidityPool.connect(user1).borrow(ethers.utils.parseEther("0.1"));
            const debt = await liquidityPool.userDebt(user1.address);
            await expect(
                liquidityPool.connect(user1).repay({ value: debt.add(ethers.utils.parseEther("1")) })
            ).to.be.revertedWith("Overpayment not allowed");

            // Test withdraw more collateral than available
            await expect(
                liquidityPool.connect(user1).withdrawCollateral(glintToken.address, ethers.utils.parseEther("1000"))
            ).to.be.revertedWith("Insufficient collateral balance");

            // Test operations when paused
            await liquidityPool.togglePause();
            await expect(
                liquidityPool.connect(user1).borrow(ethers.utils.parseEther("0.1"))
            ).to.be.revertedWith("Contract is paused");
        });

        it("should handle tier configurations", async function () {
            // Test updateBorrowTier
            await liquidityPool.updateBorrowTier(0, 90, 100, 110, -10, 50);
            const tier = await liquidityPool.borrowTierConfigs(0);
            expect(tier.minScore).to.equal(90);
            expect(tier.maxScore).to.equal(100);
            expect(tier.collateralRatio).to.equal(110);
            expect(tier.interestRateModifier).to.equal(-10);
            expect(tier.maxLoanAmount).to.equal(50);

            // Test access control
            await expect(
                liquidityPool.connect(user1).updateBorrowTier(0, 90, 100, 110, -10, 50)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("LendingManager Complete Coverage", function () {
        it("should cover all LendingManager functions", async function () {
            // Test depositFunds
            await expect(
                lendingManager.connect(lender1).depositFunds({ value: ethers.utils.parseEther("5") })
            ).to.emit(lendingManager, "FundsDeposited");

            // Test getLenderInfo
            const info = await lendingManager.getLenderInfo(lender1.address);
            expect(info.balance).to.equal(ethers.utils.parseEther("5"));

            // Test claimInterest
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await lendingManager.connect(lender1).claimInterest();

            // Test withdrawal process
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("2"));
            expect(await lendingManager.withdrawalRequests(lender1.address)).to.be.gt(0);

            await lendingManager.connect(lender1).cancelWithdrawal();
            expect(await lendingManager.withdrawalRequests(lender1.address)).to.equal(0);

            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("2"));
            await ethers.provider.send("evm_increaseTime", [86401]);
            await ethers.provider.send("evm_mine");
            await lendingManager.connect(lender1).executeWithdrawal();

            // Test admin functions
            await lendingManager.setCurrentDailyRate(ethers.utils.parseUnits("1.0002", 18));
            expect(await lendingManager.currentDailyRate()).to.equal(ethers.utils.parseUnits("1.0002", 18));

            // Test view functions
            const potentialInterest = await lendingManager.calculatePotentialInterest(
                ethers.utils.parseEther("1"),
                30
            );
            expect(potentialInterest).to.be.gt(0);

            const totalLent = await lendingManager.getTotalLent();
            expect(totalLent).to.be.gt(0);

            const availableFunds = await lendingManager.getAvailableFunds();
            expect(availableFunds).to.be.gte(0);
        });

        it("should handle LendingManager edge cases", async function () {
            // Test minimum deposit
            await expect(
                lendingManager.connect(user1).depositFunds({ value: ethers.utils.parseEther("0.005") })
            ).to.be.revertedWith("Minimum deposit is 0.01 ETH");

            // Test invalid interest rate
            await expect(
                lendingManager.setCurrentDailyRate(ethers.utils.parseUnits("0.9", 18))
            ).to.be.revertedWith("Rate must be between 1.0 and 1.01");

            await expect(
                lendingManager.setCurrentDailyRate(ethers.utils.parseUnits("1.02", 18))
            ).to.be.revertedWith("Rate must be between 1.0 and 1.01");

            // Test withdrawal without request
            await expect(
                lendingManager.connect(user1).executeWithdrawal()
            ).to.be.revertedWith("No withdrawal request");

            // Test early withdrawal
            await lendingManager.connect(lender1).depositFunds({ value: ethers.utils.parseEther("1") });
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("0.5"));
            await lendingManager.connect(lender1).executeWithdrawal();

            // Test access control
            await expect(
                lendingManager.connect(user1).setCurrentDailyRate(ethers.utils.parseUnits("1.0002", 18))
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("InterestRateModel Complete Coverage", function () {
        it("should cover all InterestRateModel functions", async function () {
            // Test constructor values
            expect(await interestRateModel.baseRate()).to.equal(ethers.utils.parseEther("0.05"));
            expect(await interestRateModel.optimalUtilization()).to.equal(ethers.utils.parseEther("0.8"));

            // Test calculateInterestRate
            const rate = await interestRateModel.calculateInterestRate(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("50")
            );
            expect(rate).to.be.gt(0);

            // Test updateRates
            await interestRateModel.updateRates(
                ethers.utils.parseEther("0.06"),
                ethers.utils.parseEther("0.85"),
                ethers.utils.parseEther("0.12"),
                ethers.utils.parseEther("0.35")
            );
            expect(await interestRateModel.baseRate()).to.equal(ethers.utils.parseEther("0.06"));

            // Test updateReserveFactor
            await interestRateModel.updateReserveFactor(ethers.utils.parseEther("0.15"));
            expect(await interestRateModel.reserveFactor()).to.equal(ethers.utils.parseEther("0.15"));

            // Test updateLiquidationParameters
            await interestRateModel.updateLiquidationParameters(
                ethers.utils.parseEther("1.1"),
                ethers.utils.parseEther("0.06"),
                ethers.utils.parseEther("0.04"),
                ethers.utils.parseEther("0.25")
            );
            expect(await interestRateModel.liquidationIncentive()).to.equal(ethers.utils.parseEther("1.1"));

            // Test emergency functions
            await interestRateModel.emergencyPause();
            expect(await interestRateModel.paused()).to.be.true;

            await interestRateModel.emergencyUnpause();
            expect(await interestRateModel.paused()).to.be.false;

            // Test view functions
            const utilizationRate = await interestRateModel.getUtilizationRate(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("50")
            );
            expect(utilizationRate).to.be.gt(0);

            const supplyRate = await interestRateModel.getSupplyRate(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("50")
            );
            expect(supplyRate).to.be.gte(0);
        });

        it("should handle InterestRateModel edge cases", async function () {
            // Test access control
            await expect(
                interestRateModel.connect(user1).updateRates(
                    ethers.utils.parseEther("0.06"),
                    ethers.utils.parseEther("0.85"),
                    ethers.utils.parseEther("0.12"),
                    ethers.utils.parseEther("0.35")
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");

            // Test invalid parameters
            await expect(
                interestRateModel.updateRates(
                    ethers.utils.parseEther("1.1"), // > 100%
                    ethers.utils.parseEther("0.85"),
                    ethers.utils.parseEther("0.12"),
                    ethers.utils.parseEther("0.35")
                )
            ).to.be.revertedWith("Invalid base rate");

            // Test zero utilization
            const rateZero = await interestRateModel.calculateInterestRate(
                ethers.utils.parseEther("100"),
                0
            );
            expect(rateZero).to.equal(await interestRateModel.baseRate());

            // Test 100% utilization
            const rateFull = await interestRateModel.calculateInterestRate(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            expect(rateFull).to.be.gt(await interestRateModel.baseRate());
        });
    });

    describe("IntegratedCreditSystem Complete Coverage", function () {
        it("should cover all IntegratedCreditSystem functions", async function () {
            // Test updateCreditScore
            await expect(
                creditSystem.updateCreditScore(user1.address, 85, "Good payment history")
            ).to.emit(creditSystem, "CreditScoreUpdated");

            expect(await creditSystem.getCreditScore(user1.address)).to.equal(85);

            // Test addCreditFactor
            await creditSystem.addCreditFactor(user1.address, 10, "Bonus for early payment");
            expect(await creditSystem.getCreditScore(user1.address)).to.equal(95);

            // Test subtractCreditFactor
            await creditSystem.subtractCreditFactor(user1.address, 5, "Late payment penalty");
            expect(await creditSystem.getCreditScore(user1.address)).to.equal(90);

            // Test getCreditHistory
            const history = await creditSystem.getCreditHistory(user1.address);
            expect(history.length).to.be.gt(0);

            // Test batch operations
            const users = [user2.address, user3.address];
            const scores = [80, 75];
            await creditSystem.batchUpdateCreditScores(users, scores);
            expect(await creditSystem.getCreditScore(user2.address)).to.equal(80);
            expect(await creditSystem.getCreditScore(user3.address)).to.equal(75);

            // Test risk assessment
            const riskLevel = await creditSystem.assessRiskLevel(user1.address);
            expect(riskLevel).to.be.gte(0);

            // Test credit tier
            const tier = await creditSystem.getCreditTier(user1.address);
            expect(tier).to.be.gte(0);

            // Test admin functions
            await creditSystem.setMinimumScore(300);
            expect(await creditSystem.minimumCreditScore()).to.equal(300);

            await creditSystem.setMaximumScore(900);
            expect(await creditSystem.maximumCreditScore()).to.equal(900);

            // Test pause functionality
            await creditSystem.pause();
            expect(await creditSystem.paused()).to.be.true;

            await creditSystem.unpause();
            expect(await creditSystem.paused()).to.be.false;
        });

        it("should handle IntegratedCreditSystem edge cases", async function () {
            // Test invalid score ranges
            await expect(
                creditSystem.updateCreditScore(user1.address, 1001, "Invalid high score")
            ).to.be.revertedWith("Score out of range");

            await expect(
                creditSystem.updateCreditScore(user1.address, 299, "Invalid low score")
            ).to.be.revertedWith("Score out of range");

            // Test zero address
            await expect(
                creditSystem.updateCreditScore(ethers.constants.AddressZero, 750, "Zero address")
            ).to.be.revertedWith("Invalid address");

            // Test access control
            await expect(
                creditSystem.connect(user1).updateCreditScore(user2.address, 750, "Unauthorized")
            ).to.be.revertedWith("Ownable: caller is not the owner");

            // Test operations when paused
            await creditSystem.pause();
            await expect(
                creditSystem.updateCreditScore(user1.address, 750, "Paused operation")
            ).to.be.revertedWith("Pausable: paused");
        });
    });

    describe("GlintToken Complete Coverage", function () {
        it("should cover all GlintToken functions", async function () {
            // Test initial supply
            expect(await glintToken.totalSupply()).to.equal(ethers.utils.parseEther("1000000"));
            expect(await glintToken.balanceOf(deployer.address)).to.equal(ethers.utils.parseEther("1000000"));

            // Test standard ERC20 functions
            await glintToken.transfer(user1.address, ethers.utils.parseEther("1000"));
            expect(await glintToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("1000"));

            await glintToken.connect(user1).approve(user2.address, ethers.utils.parseEther("500"));
            expect(await glintToken.allowance(user1.address, user2.address)).to.equal(ethers.utils.parseEther("500"));

            await glintToken.connect(user2).transferFrom(user1.address, user3.address, ethers.utils.parseEther("200"));
            expect(await glintToken.balanceOf(user3.address)).to.equal(ethers.utils.parseEther("200"));

            // Test name and symbol
            expect(await glintToken.name()).to.equal("Glint Token");
            expect(await glintToken.symbol()).to.equal("GLINT");
            expect(await glintToken.decimals()).to.equal(18);
        });
    });

    describe("Integration Tests", function () {
        it("should handle complete lending cycle", async function () {
            // Lender deposits funds
            await lendingManager.connect(lender1).depositFunds({ value: ethers.utils.parseEther("10") });

            // Borrower deposits collateral and borrows
            await glintToken.transfer(borrower1.address, ethers.utils.parseEther("500"));
            await glintToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("500"));
            await liquidityPool.connect(borrower1).depositCollateral(glintToken.address, ethers.utils.parseEther("200"));
            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"));

            // Time passes, interest accrues
            await ethers.provider.send("evm_increaseTime", [86400 * 30]);
            await ethers.provider.send("evm_mine");

            // Borrower repays
            const debt = await liquidityPool.userDebt(borrower1.address);
            await liquidityPool.connect(borrower1).repay({ value: debt });

            // Lender claims interest and withdraws
            await lendingManager.connect(lender1).claimInterest();
            await lendingManager.connect(lender1).requestWithdrawal(ethers.utils.parseEther("5"));
            await ethers.provider.send("evm_increaseTime", [86401]);
            await ethers.provider.send("evm_mine");
            await lendingManager.connect(lender1).executeWithdrawal();

            // Verify final state
            expect(await liquidityPool.userDebt(borrower1.address)).to.equal(0);
            expect(await votingToken.balanceOf(borrower1.address)).to.be.gt(0);
        });

        it("should handle liquidation scenario", async function () {
            // Set up borrower with collateral
            await glintToken.transfer(borrower1.address, ethers.utils.parseEther("200"));
            await glintToken.connect(borrower1).approve(liquidityPool.address, ethers.utils.parseEther("200"));
            await liquidityPool.connect(borrower1).depositCollateral(glintToken.address, ethers.utils.parseEther("150"));
            await liquidityPool.connect(borrower1).borrow(ethers.utils.parseEther("1"));

            // Price drops, making position unhealthy
            await mockPriceFeed.setPrice(ethers.utils.parseUnits("0.5", 8));

            // Check collateralization
            const [isHealthy] = await liquidityPool.checkCollateralization(borrower1.address);
            expect(isHealthy).to.be.false;

            // Liquidation would happen here in a real scenario
            // For now, just verify the position is unhealthy
            expect(isHealthy).to.be.false;
        });
    });
});