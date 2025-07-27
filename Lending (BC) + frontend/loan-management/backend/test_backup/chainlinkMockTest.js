const { expect } = require("chai");
const { ethers } = require("hardhat");
const { upgrades } = require("hardhat");

describe("LiquidityPool - Chainlink Automation Simulation with Glint Token", function () {
  let liquidityPool, lendingManager, stablecoinManager, interestRateModel, glintToken, mockFeedGlint;
  let deployer, user1, user2;

  beforeEach(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    // Deploy StablecoinManager first
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    stablecoinManager = await StablecoinManager.deploy(deployer.address);
    await stablecoinManager.waitForDeployment();
    const stablecoinManagerAddress = await stablecoinManager.address;

    // Deploy InterestRateModel with correct constructor arguments
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    interestRateModel = await InterestRateModel.deploy(
      deployer.address,
      ethers.ZeroAddress,
      "50000000000000000", // 5% baseRate (0.05 * 1e18)
      "800000000000000000", // 80% kink (0.8 * 1e18)
      "100000000000000000", // 10% slope1 (0.1 * 1e18)
      "300000000000000000", // 30% slope2 (0.3 * 1e18)
      "100000000000000000", // 10% reserveFactor (0.1 * 1e18)
      "1000000000000000000", // 100% maxBorrowRate (1.0 * 1e18)
      "50000000000000000", // 5% maxRateChange (0.05 * 1e18)
      "30000000000000000", // 3% ethPriceRiskPremium (0.03 * 1e18)
      "200000000000000000", // 20% ethVolatilityThreshold (0.2 * 1e18)
      86400 // 24h oracleStalenessWindow (in seconds)
    );
    await interestRateModel.waitForDeployment();
    const interestRateModelAddress = interestRateModel.address;

    // Deploy LiquidityPool with correct arguments
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    liquidityPool = await upgrades.deployProxy(LiquidityPool, [
      deployer.address,
      stablecoinManagerAddress,
      ethers.ZeroAddress, // Use correct zero address
      interestRateModelAddress,
      ethers.ZeroAddress // _creditSystem
    ], {
      initializer: "initialize",
    });
    await liquidityPool.waitForDeployment();
    const poolAddress = liquidityPool.address;
    if (!poolAddress) throw new Error("LiquidityPool address is undefined before deploying LendingManager");

    // Now deploy LendingManager with correct argument order: (poolAddress, deployer.address)
    const LendingManager = await ethers.getContractFactory("LendingManager");
    lendingManager = await LendingManager.deploy(poolAddress, deployer.address);
    await lendingManager.waitForDeployment();
    const lendingManagerAddress = lendingManager.address;
    if (!lendingManagerAddress) throw new Error("LendingManager address is undefined after deployment");

    // Update LiquidityPool with the correct LendingManager address
    await liquidityPool.setLendingManager(lendingManagerAddress);

    // Fund the liquidity pool directly
    await deployer.sendTransaction({
      to: await liquidityPool.address,
      value: ethers.parseEther("10")
    });

    // Deploy GlintToken
    const GlintToken = await ethers.getContractFactory("GlintToken");
    const initialSupply = ethers.parseEther("100");
    glintToken = await GlintToken.deploy(initialSupply);
    await glintToken.waitForDeployment();

    // Deploy Mock Price Feed
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    mockFeedGlint = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
    await mockFeedGlint.waitForDeployment();

    // Set up collateral token
    await liquidityPool.setAllowedCollateral(glintToken.address, true);
    await liquidityPool.setPriceFeed(glintToken.address, mockFeedGlint.address);

    // Fund pool with enough ETH for lending
    await deployer.sendTransaction({
      to: await liquidityPool.address,
      value: ethers.parseEther("10") // Send 10 ETH to ensure enough funds
    });

    // Set credit score for deployer so they can lend
    await liquidityPool.setCreditScore(deployer.address, 80);

    // Deposit as lender to set up totalLent
    await lendingManager.connect(deployer).depositFunds({ value: ethers.parseEther("10") });

    // Transfer and approve Glint tokens to user1
    await glintToken.transfer(user1.address, ethers.parseEther("10"));
    await glintToken.connect(user1).approve(liquidityPool.address, ethers.parseEther("10"));

    // Set credit score
    await liquidityPool.setCreditScore(user1.address, 80);
  });

  it("should trigger upkeep and execute liquidation", async function () {
    // Deposit collateral
    await liquidityPool.connect(user1).depositCollateral(glintToken.address, ethers.parseEther("5"));

    // Borrow funds (less than half of totalLent)
    await liquidityPool.connect(user1).borrow(ethers.parseEther("1"));

    // Drop price to trigger liquidation
    await mockFeedGlint.setPrice(2e7); // $0.20

    // Start liquidation
    await liquidityPool.startLiquidation(user1.address);

    // Fast forward past grace period
    await ethers.provider.send("evm_increaseTime", [3 * 86400 + 1]); // 3 days + 1 second
    await ethers.provider.send("evm_mine", []);

    // Check if upkeep is needed
    const [upkeepNeeded, performData] = await liquidityPool.checkUpkeep("0x");
    expect(upkeepNeeded).to.be.true;

    // Perform upkeep
    // Use manual event check to avoid provider error with .to.emit
    const tx = await liquidityPool.performUpkeep(performData);
    const receipt = await tx.wait();
    const found = receipt.events && receipt.events.some(e => e.event === "LiquidationExecuted");
    expect(found).to.be.true;

    // Verify liquidation was executed
    expect(await liquidityPool.isLiquidatable(user1.address)).to.be.false;
    expect((await liquidityPool.userDebt(user1.address)).eq(0)).to.be.true;
    expect((await liquidityPool.getCollateral(user1.address, glintToken.address)).eq(0)).to.be.true;
  });
});
