const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPoolV3 - Chainlink Automation Simulation with Glint Token", function () {
  let owner, user1, user2;
  let pool, glint;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const GlintToken = await ethers.getContractFactory("GlintToken");
    const initialSupply = ethers.parseEther("1000000");
    glint = await GlintToken.deploy(initialSupply);
    await glint.waitForDeployment();

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const mockFeed = await MockPriceFeed.deploy(1e8, 8);
    await mockFeed.waitForDeployment();

    const LiquidityPool = await ethers.getContractFactory("LiquidityPoolV3");
    pool = await LiquidityPool.deploy();
    await pool.waitForDeployment();
    

    await pool.initialize(owner.address);
    await pool.setAllowedCollateral(glint.target, true);
    await pool.setPriceFeed(glint.target, mockFeed.target);



    // FUND CONTRACT
    await owner.sendTransaction({
    to: pool.target,
    value: ethers.parseEther("1000"),
    });


    // Distribute and approve tokens
    await glint.transfer(user1.address, ethers.parseEther("1000"));
    await glint.connect(user1).approve(pool.target, ethers.parseEther("1000"));

    await glint.transfer(user2.address, ethers.parseEther("1000"));
    await glint.connect(user2).approve(pool.target, ethers.parseEther("1000"));

    // User1 deposits collateral and borrows
    await pool.connect(user1).depositCollateral(glint.target, ethers.parseEther("500"));
    await pool.setCreditScore(user1.address, 80);
    await pool.connect(user1).borrow(ethers.parseEther("100"));

    // now lets drop the price to 0.2 dollars
    await mockFeed.setPrice(2e7);

    // Mark user as liquidatable
    await pool.startLiquidation(user1.address);
    
    //wait until grace period ends
    const currentTime = (await ethers.provider.getBlock("latest")).timestamp;
    const gracePeriod = await pool.maxLiquidationGracePeriod();
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(currentTime + Number(gracePeriod) + 1)]);
    await ethers.provider.send("evm_mine", []);
  });

  it("should trigger upkeep and execute liquidation", async function () {
    const [upkeepNeeded, performData] = await pool.checkUpkeep("0x");
    expect(upkeepNeeded).to.equal(true);

    await pool.performUpkeep(performData);

    const debt = await pool.userDebt(user1.address);
    expect(debt).to.equal(0);
    const isLiquid = await pool.isLiquidatable(user1.address);
    expect(isLiquid).to.equal(false);
  });
});

// more tests will be added
