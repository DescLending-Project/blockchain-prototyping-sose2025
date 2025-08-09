const fs = require('fs');
const path = require('path');

// Contract names to copy - UPDATED to include missing contracts
const contracts = [
    'VotingToken',
    'ProtocolGovernor',
    'LiquidityPool',
    'LendingManager',
    'StablecoinManager',
    'InterestRateModel',
    'GlintToken',
    'IntegratedCreditSystem',
    'SimpleRISC0Test',
    'MockRiscZeroVerifier',
    'NullifierRegistry'
];

// OpenZeppelin contracts (different path)
const openzeppelinContracts = [
    'TimelockController'
];
const srcDir = path.join(__dirname, '../../backend/artifacts/contracts');
const destDir = path.join(__dirname, '../../frontend/src/abis');

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

contracts.forEach(name => {
    const artifact = path.join(srcDir, `${name}.sol/${name}.json`);
    if (fs.existsSync(artifact)) {
        fs.copyFileSync(artifact, path.join(destDir, `${name}.json`));
        console.log(`Copied ${name} ABI`);
    } else {
        console.warn(`Artifact not found: ${artifact}`);
    }
});

// Copy OpenZeppelin contracts
const ozSrcDir = path.join(__dirname, '../artifacts/@openzeppelin/contracts');
openzeppelinContracts.forEach(name => {
    let artifact;
    if (name === 'TimelockController') {
        artifact = path.join(ozSrcDir, `governance/TimelockController.sol/TimelockController.json`);
    }
    // Add more OpenZeppelin contracts here as needed

    if (artifact && fs.existsSync(artifact)) {
        fs.copyFileSync(artifact, path.join(destDir, `${name}.json`));
        console.log(`Copied ${name} ABI from OpenZeppelin`);
    } else {
        console.warn(`OpenZeppelin artifact not found: ${artifact}`);
    }
});

const mockContracts = [
    'MockPriceFeed',
    'OracleMock'
];
const mockSrcDir = path.join(__dirname, '../../backend/artifacts/contracts/mocks');
mockContracts.forEach(name => {
    const artifact = path.join(mockSrcDir, `${name}.sol/${name}.json`);
    if (fs.existsSync(artifact)) {
        fs.copyFileSync(artifact, path.join(destDir, `${name}.json`));
        console.log(`Copied ${name} ABI`);
    } else {
        console.warn(`Artifact not found: ${artifact}`);
    }
});

// Copy interface contracts
const interfaceContracts = [
    'ICreditScore',
    'AggregatorV3Interface',
    'IVotingToken'
];
const interfaceSrcDir = path.join(__dirname, '../../backend/artifacts/contracts/interfaces');
interfaceContracts.forEach(name => {
    const artifact = path.join(interfaceSrcDir, `${name}.sol/${name}.json`);
    if (fs.existsSync(artifact)) {
        // Copy ICreditScore as CreditScore for frontend compatibility
        const destName = name === 'ICreditScore' ? 'CreditScore' : name;
        fs.copyFileSync(artifact, path.join(destDir, `${destName}.json`));
        console.log(`Copied ${name} ABI as ${destName}`);
    } else {
        console.warn(`Interface artifact not found: ${artifact}`);
    }
});

console.log('copy-artifacts.js finished');
