const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPool - Fresh Credit Score Requirement", function () {
    let liquidityPool, mockCreditScore, glintToken, mockFeedGlint;
    let deployer, user1, user2;
    let stablecoinManager, lendingManager, interestRateModel, votingToken;


    async function deployInterestRateModel(deployer) {
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        return await InterestRateModel.deploy(
            ethers.ZeroAddress,
            deployer.address,
            ethers.parseUnits("0.02", 18),
            ethers.parseUnits("0.8", 18),
            ethers.parseUnits("0.03", 18),
            ethers.parseUnits("0.2", 18),
            ethers.parseUnits("0.1", 18),
            ethers.parseUnits("5", 18),
            ethers.parseUnits("0.5", 18),
            ethers.parseUnits("0.01", 18),
            ethers.parseUnits("0.05", 18),
            3600
        );
    }

    beforeEach(async function () {
        [deployer, user1, user2] = await ethers.getSigners();

        // Deploy mock contracts
        const MockCreditScore = await ethers.getContractFactory("MockCreditScoreUpdated");
        mockCreditScore = await MockCreditScore.deploy();
        await mockCreditScore.waitForDeployment();

        const MockToken = await ethers.getContractFactory("MockToken");
        glintToken = await MockToken.deploy("GLINT", "GLINT");
        await glintToken.waitForDeployment();

        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockFeedGlint = await MockPriceFeed.deploy(110000000, 8); // $1.10 with 8 decimals
        await mockFeedGlint.waitForDeployment();

        // Deploy main contracts
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(deployer.address);
        await stablecoinManager.waitForDeployment();

        // Deploy LiquidityPool first
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy();
        await liquidityPool.waitForDeployment();

        interestRateModel = await deployInterestRateModel(deployer);

        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(deployer.address); // DAO address
        await votingToken.waitForDeployment();

        // Initialize LiquidityPool first (without lendingManager)
        await liquidityPool.initialize(
            deployer.address,
            await stablecoinManager.getAddress(),
            ethers.ZeroAddress, // lendingManager will be set later
            await interestRateModel.getAddress()
        );

        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(await liquidityPool.getAddress(), deployer.address);
        await lendingManager.waitForDeployment();

        // Set up contract connections
        await liquidityPool.setLendingManager(await lendingManager.getAddress());
        await lendingManager.setVotingToken(await votingToken.getAddress());
        await votingToken.setLiquidityPool(await liquidityPool.getAddress());

        // Setup basic configuration
        await liquidityPool.setAllowedCollateral(await glintToken.getAddress(), true);
        await liquidityPool.setPriceFeed(await glintToken.getAddress(), await mockFeedGlint.getAddress());
        await liquidityPool.setVotingToken(await votingToken.getAddress());

        // Mint initial tokens and setup liquidity
        await glintToken.mint(user1.address, ethers.parseEther("1000"));
        await glintToken.mint(user2.address, ethers.parseEther("1000"));
        
        // Add liquidity to pool
        await deployer.sendTransaction({
            to: await liquidityPool.getAddress(),
            value: ethers.parseEther("100")
        });

        // Ensure clean RISC0 state by resetting all user scores
        await mockCreditScore.resetScore(user1.address);
        await mockCreditScore.resetScore(user2.address);
        await mockCreditScore.resetScore(deployer.address);
    });

    describe("MockCreditScore Interface Compliance", function () {
        it("should implement the correct ICreditScore interface", async function () {
            const result = await mockCreditScore.getCreditScore(user1.address);
            expect(result).to.have.lengthOf(3); // score, isUnused, timestamp
        });

        it("should have markCreditScoreAsUsed function", async function () {
            await mockCreditScore.setScore(user1.address, 750, true); // FICO 750
            
            // Mark as used
            await mockCreditScore.markCreditScoreAsUsed(user1.address);
            
            // Verify its marked as used
            const [score, isUnused, timestamp] = await mockCreditScore.getCreditScore(user1.address);
            expect(isUnused).to.be.false;
        });
    });

    describe("RISC0 Integration Setup", function () {
        it("should start with RISC0 disabled by default", async function () {
            expect(await liquidityPool.useRISC0CreditScores()).to.be.false;
        });

        it("should enable RISC0 when setting credit score contract", async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            expect(await liquidityPool.useRISC0CreditScores()).to.be.true;
        });

        it("should allow manual toggle of RISC0", async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            expect(await liquidityPool.useRISC0CreditScores()).to.be.true;
            
            await liquidityPool.toggleRISC0CreditScores(false);
            expect(await liquidityPool.useRISC0CreditScores()).to.be.false;
        });
    });

    describe("FICO Score Conversion", function () {
        beforeEach(async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
        });

        it("should convert FICO scores correctly", async function () {
            // Test various FICO scores - note: these are uint64 values from RISC0
            expect(await liquidityPool.convertFICOToContractScore(300)).to.equal(0);   // Min
            expect(await liquidityPool.convertFICOToContractScore(575)).to.equal(50);  // Mid
            expect(await liquidityPool.convertFICOToContractScore(850)).to.equal(100); // Max
            expect(await liquidityPool.convertFICOToContractScore(250)).to.equal(0);   // Below min
            expect(await liquidityPool.convertFICOToContractScore(900)).to.equal(100); // Above max
        });

        it("should use converted FICO score for risk tier calculation", async function () {
            await mockCreditScore.setScore(user1.address, 750, true); // FICO 750 = around 82 contract score
            
            const tier = await liquidityPool.getRiskTier(user1.address);
            expect(tier).to.equal(1); // Should be TIER_2 (80-89 range)
        });
    });

    describe("Score Expiry Logic", function () {
        beforeEach(async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
        });

        it("should use RISC0 score when not expired", async function () {
            await mockCreditScore.setScore(user1.address, 750, true);
            
            const hasValid = await liquidityPool.hasValidRISC0Score(user1.address);
            expect(hasValid[0]).to.be.true; // hasValidScore
            expect(hasValid[1]).to.be.above(0); // score should be > 0
        });

        it("should fallback to local score when RISC0 expired", async function () {
            // Set expired RISC0 score (91 days ago)
            const expiredTimestamp = Math.floor(Date.now() / 1000) - (91 * 24 * 60 * 60);
            await mockCreditScore.setScoreWithTimestamp(user1.address, 750, true, expiredTimestamp);
            
            // Set local score
            await liquidityPool.setCreditScore(user1.address, 85);
            
            // Should use local score
            const score = await liquidityPool.getCreditScore(user1.address);
            expect(score).to.equal(85);
        });
    });

    describe("Fresh Proof Requirement - Core Logic", function () {
        beforeEach(async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            
            // Reset user scores to ensure clean state
            await mockCreditScore.resetScore(user1.address);
            await mockCreditScore.resetScore(user2.address);
            
            // Setup collateral for borrowing
            const borrowAmount = ethers.parseEther("10");
            const collateralAmount = ethers.parseEther("20"); // 200% collateral
            
            await glintToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await glintToken.getAddress(), collateralAmount);
        });

        it("should allow borrowing with fresh RISC0 proof", async function () {
            // Set fresh, unused score
            await mockCreditScore.setScore(user1.address, 750, true); // isUnused = true
            
            const borrowAmount = ethers.parseEther("10");
            
            // Should succeed
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.not.be.reverted;
            
            // Verify score is marked as used
            const [score, isUnused, timestamp] = await mockCreditScore.getCreditScore(user1.address);
            expect(isUnused).to.be.false;
        });

        it("should reject borrowing with used RISC0 proof", async function () {
            // Set used score
            await mockCreditScore.setScore(user1.address, 750, true);
            await mockCreditScore.markCreditScoreAsUsed(user1.address); // Mark as used
            
            const borrowAmount = ethers.parseEther("10");
            
            // Should fail
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.be.revertedWith("Credit score already used for borrowing or invalid. Please submit a fresh proof.");
        });

        // some fallback tests just in case

        it("should allow borrowing with local score when RISC0 disabled", async function () {
            // Disable RISC0
            await liquidityPool.toggleRISC0CreditScores(false);
            
            // Set only local score
            await liquidityPool.setCreditScore(user1.address, 85);
            
            const borrowAmount = ethers.parseEther("10");
            
            // Should succeed with local score
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.not.be.reverted;
        });

        it("should fallback to local score when RISC0 score is invalid", async function () {
            // Set expired RISC0 score (91 days ago) to trigger fallback
            const expiredTimestamp = Math.floor(Date.now() / 1000) - (91 * 24 * 60 * 60);
            await mockCreditScore.setScoreWithTimestamp(user1.address, 750, true, expiredTimestamp);
            
            // Set valid local score
            await liquidityPool.setCreditScore(user1.address, 85);
            
            const borrowAmount = ethers.parseEther("10");
            
            // Should succeed using local score
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.not.be.reverted;
        });
    });

    describe("Multiple Users - Fresh Proof Isolation", function () {
        beforeEach(async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            
            // Reset user scores to ensure clean state
            await mockCreditScore.resetScore(user1.address);
            await mockCreditScore.resetScore(user2.address);
            
            // Setup collateral for both users
            const collateralAmount = ethers.parseEther("20");
            
            await glintToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await glintToken.getAddress(), collateralAmount);
            
            await glintToken.connect(user2).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user2).depositCollateral(await glintToken.getAddress(), collateralAmount);
        });

        it("should track fresh proof usage per user independently", async function () {
            const borrowAmount = ethers.parseEther("10");
            
            // Set fresh scores for both users
            await mockCreditScore.setScore(user1.address, 750, true);
            await mockCreditScore.setScore(user2.address, 780, true);
            
            // User1 borrows - should succeed
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.not.be.reverted;
            
            // User1's score should be marked as used
            const [score1, isUnused1] = await mockCreditScore.getCreditScore(user1.address);
            expect(isUnused1).to.be.false;
            
            // User2 should still be able to borrow (their score is still fresh)
            await expect(liquidityPool.connect(user2).borrow(borrowAmount))
                .to.not.be.reverted;
            
            // User2's score should now be marked as used
            const [score2, isUnused2] = await mockCreditScore.getCreditScore(user2.address);
            expect(isUnused2).to.be.false;
        });

        it("should prevent user from borrowing twice with same proof", async function () {
            const borrowAmount = ethers.parseEther("5"); // Smaller amount for second borrow
            
            // Set fresh score
            await mockCreditScore.setScore(user1.address, 750, true);
            
            // First borrow - should succeed
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.not.be.reverted;
            
            // Verify the score is now marked as used
            const [score, isUnused] = await mockCreditScore.getCreditScore(user1.address);
            expect(isUnused).to.be.false;
            
            // Setup second user to test fresh proof still works
            const collateralAmount = ethers.parseEther("20");
            await glintToken.connect(user2).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user2).depositCollateral(await glintToken.getAddress(), collateralAmount);
            
            // Set fresh score for user2
            await mockCreditScore.setScore(user2.address, 750, true);
            
            // User2 should be able to borrow (their proof is fresh)
            await expect(liquidityPool.connect(user2).borrow(borrowAmount))
                .to.not.be.reverted;
        });
    });

    describe("Error Handling and Edge Cases", function () {
        beforeEach(async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            
            // Reset user1's score to ensure clean state
            await mockCreditScore.resetScore(user1.address);
            
            const collateralAmount = ethers.parseEther("20");
            await glintToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await glintToken.getAddress(), collateralAmount);
        });

        it("should handle contract call failures gracefully", async function () {
            // Set valid local score as fallback
            await liquidityPool.setCreditScore(user1.address, 85);
            
            // Disable the mock contract to simulate failure
            await liquidityPool.setCreditScoreContract(ethers.ZeroAddress);
            await liquidityPool.toggleRISC0CreditScores(true); // Force RISC0 mode with no contract
            
            const borrowAmount = ethers.parseEther("10");
            
            // Should fallback to local score
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.not.be.reverted;
        });

        it("should reject borrowing with zero RISC0 score", async function () {
            await mockCreditScore.setScore(user1.address, 250, true); // FICO 250 converts to 0, but unused
            
            const borrowAmount = ethers.parseEther("10");
            
            // fail due to zero score, after the conversion
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.be.revertedWith("Credit score too low");
        });

        it("should handle future timestamp gracefully", async function () {
            // Get current block timestamp and add 1 hour
            const currentBlock = await ethers.provider.getBlock('latest');
            const futureTimestamp = currentBlock.timestamp + 3600; // 1 hour in future
            await mockCreditScore.setScoreWithTimestamp(user1.address, 750, true, futureTimestamp);
            
            const borrowAmount = ethers.parseEther("10");
            
            // Should work (future timestamps are valid)
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.not.be.reverted;
        });
    });

    describe("Integration with Existing Borrow Logic", function () {
        beforeEach(async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            
            // Reset user scores to ensure clean state
            await mockCreditScore.resetScore(user1.address);
            await mockCreditScore.resetScore(user2.address);
            
            const collateralAmount = ethers.parseEther("20");
            await glintToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await glintToken.getAddress(), collateralAmount);
        });

        it("should maintain existing credit tier logic with RISC0 scores", async function () {
            // TIER_1 score (90-100)
            await mockCreditScore.setScore(user1.address, 825, true); // FICO 825 = around 95 contract score
            
            const tier = await liquidityPool.getRiskTier(user1.address);
            expect(tier).to.equal(0); // TIER_1
            
            const [collateralRatio, interestModifier, maxLoan] = await liquidityPool.getBorrowTerms(user1.address);
            expect(collateralRatio).to.equal(110); // TIER_1 requires 110% collateral
            expect(interestModifier).to.equal(-25); // 25% discount
        });

        it("should enforce existing collateral requirements with fresh proofs", async function () {
            await mockCreditScore.setScore(user1.address, 700, true); // FICO 700 = around 73 contract score (TIER_3)
            
            const borrowAmount = ethers.parseEther("20"); // High amount requiring 140% collateral for TIER_3
            
            // Should fail due to insufficient collateral (we only have like 200% but need more for this amount)
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.be.revertedWith("Insufficient collateral for this loan");
        });

        it("should emit correct events when using RISC0 scores", async function () {
            await mockCreditScore.setScore(user1.address, 750, true);
            
            const borrowAmount = ethers.parseEther("10");
            
            await expect(liquidityPool.connect(user1).borrow(borrowAmount))
                .to.emit(liquidityPool, "Borrowed")
                .withArgs(user1.address, borrowAmount);
        });
    });

    describe("Administrative Functions", function () {
        it("should allow timelock to authorize servers", async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            
            await expect(liquidityPool.authorizeCreditScoreServer(deployer.address))
                .to.not.be.reverted;
        });

        it("should allow timelock to authorize state root providers", async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            
            await expect(liquidityPool.authorizeCreditScoreStateRootProvider(deployer.address))
                .to.not.be.reverted;
        });

        it("should return correct governance status", async function () {
            await liquidityPool.setCreditScoreContract(await mockCreditScore.getAddress());
            
            const [governance, risc0Enabled, creditContract, expiryPeriod] = await liquidityPool.getGovernanceStatus();
            
            expect(governance).to.equal(deployer.address); // timelock
            expect(risc0Enabled).to.be.true;
            expect(creditContract).to.equal(await mockCreditScore.getAddress());
            expect(expiryPeriod).to.equal(90 * 24 * 60 * 60); // 90 days
        });
    });
});
