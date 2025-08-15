const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🏗️  DETAILED DEPLOYMENT COST ANALYSIS");
    console.log("=" .repeat(50));

    const [deployer] = await ethers.getSigners();
    
    const deploymentResults = {
        contracts: {},
        setup: {},
        total: 0n,
        breakdown: {}
    };

    console.log(`Deployer: ${deployer.address}`);
    console.log(`Initial Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

    // Track initial balance
    const initialBalance = await ethers.provider.getBalance(deployer.address);

    console.log("📦 CORE CONTRACTS DEPLOYMENT");
    console.log("-".repeat(30));

    // 1. MockToken (Collateral Token)
    console.log("1. Deploying MockToken...");
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy("Collateral Token", "COLL");
    const mockTokenReceipt = await mockToken.deploymentTransaction().wait();
    deploymentResults.contracts.mockToken = {
        gas: mockTokenReceipt.gasUsed,
        address: await mockToken.getAddress()
    };
    console.log(`   Gas: ${mockTokenReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await mockToken.getAddress()}`);

    // 2. MockPriceFeed
    console.log("\n2. Deploying MockPriceFeed...");
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const mockPriceFeed = await MockPriceFeed.deploy(
        ethers.parseUnits("2000", 8), // $2000 initial price
        8 // decimals
    );
    const mockPriceFeedReceipt = await mockPriceFeed.deploymentTransaction().wait();
    deploymentResults.contracts.mockPriceFeed = {
        gas: mockPriceFeedReceipt.gasUsed,
        address: await mockPriceFeed.getAddress()
    };
    console.log(`   Gas: ${mockPriceFeedReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await mockPriceFeed.getAddress()}`);

    // 3. VotingToken
    console.log("\n3. Deploying VotingToken...");
    const VotingToken = await ethers.getContractFactory("VotingToken");
    const votingToken = await VotingToken.deploy(deployer.address); // DAO address
    const votingTokenReceipt = await votingToken.deploymentTransaction().wait();
    deploymentResults.contracts.votingToken = {
        gas: votingTokenReceipt.gasUsed,
        address: await votingToken.getAddress()
    };
    console.log(`   Gas: ${votingTokenReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await votingToken.getAddress()}`);

    // 4. Timelock
    console.log("\n4. Deploying Timelock...");
    const Timelock = await ethers.getContractFactory("Timelock");
    const timelock = await Timelock.deploy(
        300, // 5 minutes delay
        [deployer.address], // proposers
        [deployer.address], // executors
        deployer.address // admin
    );
    const timelockReceipt = await timelock.deploymentTransaction().wait();
    deploymentResults.contracts.timelock = {
        gas: timelockReceipt.gasUsed,
        address: await timelock.getAddress()
    };
    console.log(`   Gas: ${timelockReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await timelock.getAddress()}`);

    // 5. StablecoinManager
    console.log("\n5. Deploying StablecoinManager...");
    const StablecoinManager = await ethers.getContractFactory("StablecoinManager");
    const stablecoinManager = await StablecoinManager.deploy();
    const stablecoinManagerReceipt = await stablecoinManager.deploymentTransaction().wait();
    deploymentResults.contracts.stablecoinManager = {
        gas: stablecoinManagerReceipt.gasUsed,
        address: await stablecoinManager.getAddress()
    };
    console.log(`   Gas: ${stablecoinManagerReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await stablecoinManager.getAddress()}`);

    // 6. InterestRateModel
    console.log("\n6. Deploying InterestRateModel...");
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy();
    const interestRateModelReceipt = await interestRateModel.deploymentTransaction().wait();
    deploymentResults.contracts.interestRateModel = {
        gas: interestRateModelReceipt.gasUsed,
        address: await interestRateModel.getAddress()
    };
    console.log(`   Gas: ${interestRateModelReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await interestRateModel.getAddress()}`);

    // 7. LendingManager
    console.log("\n7. Deploying LendingManager...");
    const LendingManager = await ethers.getContractFactory("LendingManager");
    const lendingManager = await LendingManager.deploy();
    const lendingManagerReceipt = await lendingManager.deploymentTransaction().wait();
    deploymentResults.contracts.lendingManager = {
        gas: lendingManagerReceipt.gasUsed,
        address: await lendingManager.getAddress()
    };
    console.log(`   Gas: ${lendingManagerReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await lendingManager.getAddress()}`);

    // 8. LiquidityPool (Upgradeable - Most Important)
    console.log("\n8. Deploying LiquidityPool (Upgradeable)...");
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await upgrades.deployProxy(LiquidityPool, [
        deployer.address, // timelock (using deployer for simplicity)
        await stablecoinManager.getAddress(),
        await lendingManager.getAddress(),
        await interestRateModel.getAddress()
    ], {
        initializer: "initialize",
    });
    const liquidityPoolReceipt = await liquidityPool.deploymentTransaction().wait();
    deploymentResults.contracts.liquidityPool = {
        gas: liquidityPoolReceipt.gasUsed,
        address: await liquidityPool.getAddress()
    };
    console.log(`   Gas: ${liquidityPoolReceipt.gasUsed.toLocaleString()}`);
    console.log(`   Address: ${await liquidityPool.getAddress()}`);

    // Calculate total deployment gas
    let totalDeploymentGas = 0n;
    for (const contract of Object.values(deploymentResults.contracts)) {
        totalDeploymentGas += contract.gas;
    }

    console.log("\n🔧 SYSTEM SETUP COSTS");
    console.log("-".repeat(25));

    let totalSetupGas = 0n;

    // Setup 1: Set price feed
    console.log("1. Setting up price feed...");
    const setPriceFeedTx = await liquidityPool.setPriceFeed(
        await mockToken.getAddress(), 
        await mockPriceFeed.getAddress()
    );
    const setPriceFeedReceipt = await setPriceFeedTx.wait();
    deploymentResults.setup.setPriceFeed = setPriceFeedReceipt.gasUsed;
    totalSetupGas += setPriceFeedReceipt.gasUsed;
    console.log(`   Gas: ${setPriceFeedReceipt.gasUsed.toLocaleString()}`);

    // Setup 2: Set collateral factor
    console.log("\n2. Setting collateral factor...");
    const setCollateralTx = await liquidityPool.setCollateralFactor(
        await mockToken.getAddress(), 
        ethers.parseUnits("0.8", 18) // 80% LTV
    );
    const setCollateralReceipt = await setCollateralTx.wait();
    deploymentResults.setup.setCollateralFactor = setCollateralReceipt.gasUsed;
    totalSetupGas += setCollateralReceipt.gasUsed;
    console.log(`   Gas: ${setCollateralReceipt.gasUsed.toLocaleString()}`);

    // Setup 3: Grant MINTER_ROLE to LiquidityPool
    console.log("\n3. Granting MINTER_ROLE...");
    const MINTER_ROLE = await votingToken.MINTER_ROLE();
    const grantRoleTx = await votingToken.grantRole(MINTER_ROLE, await liquidityPool.getAddress());
    const grantRoleReceipt = await grantRoleTx.wait();
    deploymentResults.setup.grantMinterRole = grantRoleReceipt.gasUsed;
    totalSetupGas += grantRoleReceipt.gasUsed;
    console.log(`   Gas: ${grantRoleReceipt.gasUsed.toLocaleString()}`);

    // Calculate final balance
    const finalBalance = await ethers.provider.getBalance(deployer.address);
    const totalEthSpent = initialBalance - finalBalance;

    deploymentResults.total = totalDeploymentGas + totalSetupGas;
    deploymentResults.breakdown = {
        deploymentGas: totalDeploymentGas,
        setupGas: totalSetupGas,
        totalGas: totalDeploymentGas + totalSetupGas,
        ethSpent: totalEthSpent
    };

    console.log("\n💰 COST SUMMARY");
    console.log("-".repeat(20));
    console.log(`Total Deployment Gas: ${totalDeploymentGas.toLocaleString()}`);
    console.log(`Total Setup Gas: ${totalSetupGas.toLocaleString()}`);
    console.log(`TOTAL GAS: ${(totalDeploymentGas + totalSetupGas).toLocaleString()}`);
    console.log(`ETH Spent: ${ethers.formatEther(totalEthSpent)} ETH`);

    console.log("\n📊 CONTRACT SIZE BREAKDOWN");
    console.log("-".repeat(30));
    
    // Sort contracts by gas cost
    const sortedContracts = Object.entries(deploymentResults.contracts)
        .sort(([,a], [,b]) => Number(b.gas - a.gas));

    for (const [name, data] of sortedContracts) {
        const percentage = (Number(data.gas) / Number(totalDeploymentGas) * 100).toFixed(1);
        console.log(`${name.padEnd(20)}: ${data.gas.toLocaleString().padStart(10)} gas (${percentage}%)`);
    }

    console.log("\n💵 COST AT DIFFERENT GAS PRICES");
    console.log("-".repeat(35));

    const gasPrices = [
        { name: "Low (10 gwei)", price: 10n },
        { name: "Medium (25 gwei)", price: 25n },
        { name: "High (50 gwei)", price: 50n },
        { name: "Extreme (100 gwei)", price: 100n }
    ];

    for (const gasPrice of gasPrices) {
        const costWei = (totalDeploymentGas + totalSetupGas) * gasPrice.price * (10n ** 9n);
        const costEth = ethers.formatEther(costWei);
        console.log(`${gasPrice.name.padEnd(20)}: ${costEth} ETH`);
    }

    // Save detailed results
    const jsonResults = JSON.stringify(deploymentResults, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2
    );

    require('fs').writeFileSync('deployment-cost-analysis.json', jsonResults);
    
    console.log("\n✅ Deployment analysis complete!");
    console.log("📄 Results saved to deployment-cost-analysis.json");

    return deploymentResults;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
