const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPoolV3 - Chainlink Automation Simulation with Glint Token", function () {
  let liquidityPool, glintToken, mockFeedGlint;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy GlintToken
    const GlintToken = await ethers.getContractFactory("GlintToken");
    const initialSupply = ethers.parseEther("100");
    glintToken = await GlintToken.deploy(initialSupply);
    await glintToken.waitForDeployment();

    // Deploy Mock Price Feed
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    mockFeedGlint = await MockPriceFeed.deploy(1e8, 8); // $1 initial price
    await mockFeedGlint.waitForDeployment();

    // Deploy LiquidityPoolV3
    const LiquidityPoolV3 = await ethers.getContractFactory("LiquidityPoolV3");
    liquidityPool = await LiquidityPoolV3.deploy();
    await liquidityPool.waitForDeployment();

    // Initialize pool
    await liquidityPool.initialize(owner.address);

    // Set up collateral token
    await liquidityPool.setAllowedCollateral(glintToken.target, true);
    await liquidityPool.setPriceFeed(glintToken.target, mockFeedGlint.target);

    // Fund pool with enough ETH for lending
    await owner.sendTransaction({
      to: await liquidityPool.getAddress(),
      value: ethers.parseEther("10") // Send 10 ETH to ensure enough funds
    });

    // Deposit as lender to set up totalLent
    await liquidityPool.connect(owner).depositFunds({ value: ethers.parseEther("10") });

    // Transfer and approve Glint tokens to user1
    await glintToken.transfer(user1.address, ethers.parseEther("10"));
    await glintToken.connect(user1).approve(liquidityPool.target, ethers.parseEther("10"));

    // Set credit score
    await liquidityPool.setCreditScore(user1.address, 80);
  });

  it("should trigger upkeep and execute liquidation", async function () {
    // Deposit collateral
    await liquidityPool.connect(user1).depositCollateral(glintToken.target, ethers.parseEther("5"));

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
    await expect(liquidityPool.performUpkeep(performData))
      .to.emit(liquidityPool, "LiquidationExecuted");

    // Verify liquidation was executed
    expect(await liquidityPool.isLiquidatable(user1.address)).to.be.false;
    expect(await liquidityPool.userDebt(user1.address)).to.equal(0);
    expect(await liquidityPool.getCollateral(user1.address, glintToken.target)).to.equal(0);
  });
});

// more tests will be added
