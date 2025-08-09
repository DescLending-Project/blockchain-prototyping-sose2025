const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to generate a unique nullifier for borrow operations
function generateNullifier(index = 0) {
    return ethers.keccak256(ethers.toUtf8Bytes(`nullifier_${Date.now()}_${index}`));
}

describe("UserHistory Functionality", function () {
    let liquidityPool, lendingManager, stablecoinManager, interestRateModel, votingToken, nullifierRegistry;
    let owner, user1, user2, liquidator;
    let mockToken, mockPriceFeed;


    beforeEach(async function () {
        [owner, user1, user2, liquidator] = await ethers.getSigners();

        // Deploy VotingToken
        const VotingToken = await ethers.getContractFactory("VotingToken");
        votingToken = await VotingToken.deploy(owner.address);
        await votingToken.waitForDeployment();

        // Deploy StablecoinManager
        const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
        stablecoinManager = await StablecoinManager.deploy(owner.address);
        await stablecoinManager.waitForDeployment();

        // Deploy InterestRateModel
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        interestRateModel = await InterestRateModel.deploy(
            "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
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

        // Deploy NullifierRegistry
        const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
        nullifierRegistry = await NullifierRegistry.deploy();
        await nullifierRegistry.waitForDeployment();
        await nullifierRegistry.initialize(owner.address);

        // Deploy LiquidityPool
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy();
        await liquidityPool.waitForDeployment();

        // Initialize LiquidityPool
        await liquidityPool.initialize(
            owner.address, // timelock
            await stablecoinManager.getAddress(),
            ethers.ZeroAddress, // lendingManager (will be set later)
            await interestRateModel.getAddress(),
            ethers.ZeroAddress, // creditSystem
            await nullifierRegistry.getAddress()
        );

        // Deploy LendingManager
        const LendingManager = await ethers.getContractFactory("LendingManager");
        lendingManager = await LendingManager.deploy(
            await liquidityPool.getAddress(),
            owner.address
        );
        await lendingManager.waitForDeployment();

        // Set up contracts
        await liquidityPool.setLendingManager(await lendingManager.getAddress());
        await liquidityPool.setVotingToken(await votingToken.getAddress());

        // Grant NULLIFIER_CONSUMER_ROLE to LiquidityPool
        const NULLIFIER_CONSUMER_ROLE = await nullifierRegistry.NULLIFIER_CONSUMER_ROLE();
        await nullifierRegistry.grantRole(NULLIFIER_CONSUMER_ROLE, await liquidityPool.getAddress());

        // Setup accounts for nullifier generation
        await nullifierRegistry.connect(owner).selectAccounts([owner.address]);
        await nullifierRegistry.connect(user1).selectAccounts([user1.address]);
        await nullifierRegistry.connect(user2).selectAccounts([user2.address]);
        await nullifierRegistry.connect(liquidator).selectAccounts([liquidator.address]);

        // Deploy mock token and price feed for collateral
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock Token", "MOCK");
        await mockToken.waitForDeployment();

        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        mockPriceFeed = await MockPriceFeed.deploy(200000000000, 8); // $2000 per token
        await mockPriceFeed.waitForDeployment();

        // Setup collateral
        await liquidityPool.setAllowedCollateral(await mockToken.getAddress(), true);
        await liquidityPool.setPriceFeed(await mockToken.getAddress(), await mockPriceFeed.getAddress());

        // Set credit scores for users
        await liquidityPool.setCreditScore(user1.address, 85);
        await liquidityPool.setCreditScore(user2.address, 80);

        // Mint tokens to users
        await mockToken.mint(user1.address, ethers.parseEther("1000"));
        await mockToken.mint(user2.address, ethers.parseEther("1000"));

        // Add funds to the pool
        await owner.sendTransaction({
            to: await liquidityPool.getAddress(),
            value: ethers.parseEther("100")
        });
    });

    describe("UserHistory Struct", function () {
        it("should initialize UserHistory with zero values", async function () {
            const history = await liquidityPool.getUserHistory(user1.address);
            expect(history.firstInteractionTimestamp).to.equal(0);
            expect(history.liquidations).to.equal(0);
            expect(history.succesfullPayments).to.equal(0);
        });

        it("should set firstInteractionTimestamp on first borrow", async function () {
            // Setup collateral for borrowing
            const borrowAmount = ethers.parseEther("1");
            const collateralAmount = ethers.parseEther("2"); // 2x collateral

            await mockToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), collateralAmount);

            // Get timestamp before borrow
            const blockBefore = await ethers.provider.getBlock("latest");
            const timestampBefore = blockBefore.timestamp;

            // Perform borrow
            const nullifier = generateNullifier(1);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier, { value: 0 });

            // Check that firstInteractionTimestamp was set
            const history = await liquidityPool.getUserHistory(user1.address);
            expect(history.firstInteractionTimestamp).to.be.greaterThan(timestampBefore);
            expect(history.firstInteractionTimestamp).to.be.greaterThan(0);
        });

        it("should not update firstInteractionTimestamp on subsequent borrows", async function () {
            // Setup and perform first borrow
            const borrowAmount = ethers.parseEther("1");
            const collateralAmount = ethers.parseEther("4"); // Extra collateral for multiple borrows

            await mockToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), collateralAmount);

            const nullifier1 = generateNullifier(1);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier1, { value: 0 });

            const historyAfterFirst = await liquidityPool.getUserHistory(user1.address);
            const firstTimestamp = historyAfterFirst.firstInteractionTimestamp;

            // Repay the first loan
            await liquidityPool.connect(user1).repay({ value: borrowAmount });

            // Perform second borrow
            const nullifier2 = generateNullifier(2);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier2, { value: 0 });

            const historyAfterSecond = await liquidityPool.getUserHistory(user1.address);
            expect(historyAfterSecond.firstInteractionTimestamp).to.equal(firstTimestamp);
        });

        it("should increment succesfullPayments on full repayment", async function () {
            // Setup and borrow
            const borrowAmount = ethers.parseEther("1");
            const collateralAmount = ethers.parseEther("2");

            await mockToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), collateralAmount);

            const nullifier = generateNullifier(1);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier, { value: 0 });

            // Check initial payment count
            let history = await liquidityPool.getUserHistory(user1.address);
            expect(history.succesfullPayments).to.equal(0);

            // Repay the loan
            await liquidityPool.connect(user1).repay({ value: borrowAmount });

            // Check that successful payments was incremented
            history = await liquidityPool.getUserHistory(user1.address);
            expect(history.succesfullPayments).to.equal(1);
        });

        it("should increment succesfullPayments on installment payment", async function () {
            // Setup and borrow
            const borrowAmount = ethers.parseEther("12"); // Minimum for installments
            const collateralAmount = ethers.parseEther("24");

            await mockToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), collateralAmount);

            const nullifier = generateNullifier(1);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier, { value: 0 });

            // Fast forward to make installment due
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
            await ethers.provider.send("evm_mine");

            // Check initial payment count
            let history = await liquidityPool.getUserHistory(user1.address);
            expect(history.succesfullPayments).to.equal(0);

            // Pay installment
            const installmentAmount = borrowAmount / 12n;
            await liquidityPool.connect(user1).repayInstallment({ value: installmentAmount });

            // Check that successful payments was incremented
            history = await liquidityPool.getUserHistory(user1.address);
            expect(history.succesfullPayments).to.equal(1);
        });

        it("should increment liquidations on liquidation", async function () {
            // Setup and borrow
            const borrowAmount = ethers.parseEther("1");
            const collateralAmount = ethers.parseEther("1.5"); // Minimal collateral for easier liquidation

            await mockToken.connect(user2).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user2).depositCollateral(await mockToken.getAddress(), collateralAmount);

            const nullifier = generateNullifier(1);
            await liquidityPool.connect(user2).borrow(borrowAmount, nullifier, { value: 0 });

            // Check initial liquidation count
            let history = await liquidityPool.getUserHistory(user2.address);
            expect(history.liquidations).to.equal(0);

            // Simulate liquidation by calling clearDebt directly (as LendingManager would)
            await liquidityPool.clearDebt(user2.address, borrowAmount);

            // Check that liquidations was incremented
            history = await liquidityPool.getUserHistory(user2.address);
            expect(history.liquidations).to.equal(1);
        });

        it("should return correct UserHistory via getUserHistory", async function () {
            // Setup and perform multiple operations
            const borrowAmount = ethers.parseEther("1");
            const collateralAmount = ethers.parseEther("2");

            await mockToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), collateralAmount);

            // First borrow
            const nullifier1 = generateNullifier(1);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier1, { value: 0 });

            // Repay
            await liquidityPool.connect(user1).repay({ value: borrowAmount });

            // Second borrow
            const nullifier2 = generateNullifier(2);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier2, { value: 0 });

            // Simulate liquidation
            await liquidityPool.clearDebt(user1.address, borrowAmount);

            // Get final history
            const history = await liquidityPool.getUserHistory(user1.address);

            expect(history.firstInteractionTimestamp).to.be.greaterThan(0);
            expect(history.succesfullPayments).to.equal(1); // One repayment
            expect(history.liquidations).to.equal(1); // One liquidation
        });

        it("should emit UserHistoryUpdated events", async function () {
            // Setup collateral
            const borrowAmount = ethers.parseEther("1");
            const collateralAmount = ethers.parseEther("2");

            await mockToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), collateralAmount);

            // Test first borrow event
            const nullifier = generateNullifier(1);
            await expect(liquidityPool.connect(user1).borrow(borrowAmount, nullifier, { value: 0 }))
                .to.emit(liquidityPool, "UserHistoryUpdated")
                .withArgs(user1.address, "first_borrow", await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));

            // Test repayment event
            await expect(liquidityPool.connect(user1).repay({ value: borrowAmount }))
                .to.emit(liquidityPool, "UserHistoryUpdated")
                .withArgs(user1.address, "repayment", await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
        });

        it("should handle multiple users independently", async function () {
            // Setup for both users
            const borrowAmount = ethers.parseEther("1");
            const collateralAmount = ethers.parseEther("2");

            // User1 operations
            await mockToken.connect(user1).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user1).depositCollateral(await mockToken.getAddress(), collateralAmount);
            const nullifier1 = generateNullifier(1);
            await liquidityPool.connect(user1).borrow(borrowAmount, nullifier1, { value: 0 });
            await liquidityPool.connect(user1).repay({ value: borrowAmount });

            // User2 operations
            await mockToken.connect(user2).approve(await liquidityPool.getAddress(), collateralAmount);
            await liquidityPool.connect(user2).depositCollateral(await mockToken.getAddress(), collateralAmount);
            const nullifier2 = generateNullifier(2);
            await liquidityPool.connect(user2).borrow(borrowAmount, nullifier2, { value: 0 });
            await liquidityPool.clearDebt(user2.address, borrowAmount); // Simulate liquidation

            // Check histories are independent
            const history1 = await liquidityPool.getUserHistory(user1.address);
            const history2 = await liquidityPool.getUserHistory(user2.address);

            expect(history1.succesfullPayments).to.equal(1);
            expect(history1.liquidations).to.equal(0);

            expect(history2.succesfullPayments).to.equal(0);
            expect(history2.liquidations).to.equal(1);
        });
    });
});
