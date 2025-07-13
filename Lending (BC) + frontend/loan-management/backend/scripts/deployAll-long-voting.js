const { ethers, upgrades, network } = require("hardhat");
const { updateAppAddresses } = require('./update-app-addresses.js');

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    // 1. Deploy Governance Token
    const GovToken = await ethers.getContractFactory("GovToken");
    const govToken = await GovToken.deploy();
    await govToken.deployed();
    console.log("GovToken deployed at:", govToken.address);

    // 2. Deploy TimelockController
    const minDelay = 3600; // 1 hour
    const proposers = [deployer.address];
    const executors = [ethers.constants.AddressZero];
    const TimelockController = await ethers.getContractFactory("TimelockController");
    const timelock = await TimelockController.deploy(minDelay, proposers, executors, deployer.address);
    await timelock.deployed();
    console.log("TimelockController deployed at:", timelock.address);

    // 3. Deploy ProtocolGovernorLongVoting (long voting period)
    const ProtocolGovernorLongVoting = await ethers.getContractFactory("mocks/ProtocolGovernorLongVoting");
    const governor = await ProtocolGovernorLongVoting.deploy(govToken.address, timelock.address);
    await governor.deployed();
    console.log("ProtocolGovernorLongVoting deployed at:", governor.address);

    // 4. Grant roles on Timelock
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
    await timelock.grantRole(PROPOSER_ROLE, governor.address);
    await timelock.grantRole(EXECUTOR_ROLE, ethers.constants.AddressZero);
    await timelock.revokeRole(ADMIN_ROLE, deployer.address);

    // 5. Deploy protocol contracts with Timelock as admin
    console.log("Deploying StablecoinManager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy(timelock.address);
    await stablecoinManager.deployed();
    const stablecoinManagerAddress = stablecoinManager.address;
    console.log("StablecoinManager:", stablecoinManagerAddress);

    // --- PATCHED: Use real initialization parameters for InterestRateModel ---
    const initializationParams = [
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // Chainlink ETH/USD Oracle (mainnet)
        timelock.address, // Timelock contract
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
    ];
    console.log("Deploying InterestRateModel...");
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy(...initializationParams);
    await interestRateModel.deployed();
    const interestRateModelAddress = interestRateModel.address;
    console.log("InterestRateModel:", interestRateModelAddress);

    console.log("Deploying LiquidityPool (proxy)...");
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        timelock.address,
        stablecoinManagerAddress,
        ethers.constants.AddressZero, // LendingManager placeholder
        interestRateModelAddress
    ], {
        initializer: "initialize",
    });
    await liquidityPool.deployed();
    const liquidityPoolAddress = liquidityPool.address;
    console.log("LiquidityPool:", liquidityPoolAddress);

    console.log("Deploying LendingManager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy(liquidityPoolAddress, timelock.address);
    await lendingManager.deployed();
    const lendingManagerAddress = lendingManager.address;
    console.log("LendingManager:", lendingManagerAddress);

    // Update LiquidityPool with LendingManager address
    console.log("Updating LiquidityPool with LendingManager address...");
    await liquidityPool.setLendingManager(lendingManagerAddress);
    console.log("LiquidityPool updated.");

    // Output all addresses
    console.log("\nDeployment complete:");
    console.log("GovToken:", govToken.address);
    console.log("TimelockController:", timelock.address);
    console.log("ProtocolGovernorLongVoting:", governor.address);
    console.log("StablecoinManager:", stablecoinManagerAddress);
    console.log("InterestRateModel:", interestRateModelAddress);
    console.log("LiquidityPool:", liquidityPoolAddress);
    console.log("LendingManager:", lendingManagerAddress);

    // Optionally update frontend/app addresses
    updateAppAddresses({
        GovToken: govToken.address,
        TimelockController: timelock.address,
        ProtocolGovernorLongVoting: governor.address,
        StablecoinManager: stablecoinManagerAddress,
        InterestRateModel: interestRateModelAddress,
        LiquidityPool: liquidityPoolAddress,
        LendingManager: lendingManagerAddress
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 