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
    'MockRiscZeroVerifier'
];
//const srcDir = path.join(__dirname, '../../artifacts/backend/contracts');
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

const mockContracts = [
    'MockPriceFeed',
    'OracleMock'
];
//const mockSrcDir = path.join(__dirname, '../../artifacts/backend/contracts/mocks');
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
console.log('copy-artifacts.js finished'); 
