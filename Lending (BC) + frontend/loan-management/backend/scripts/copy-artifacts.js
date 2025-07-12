const fs = require('fs');
const path = require('path');

// Contract names to copy - UPDATED to include missing contracts
const contracts = [
    'LendingManager',
    'LiquidityPoolV3',
    'StablecoinManager',
    'InterestRateModel',
    'IntegratedCreditSystem',
    'SimpleRISC0Test',
    'MockRiscZeroVerifier'
];

// Paths
const backendArtifactsPath = path.join(__dirname, '../artifacts/contracts');
const frontendArtifactsPath = path.join(__dirname, '../../frontend/src');
const frontendAbisPath = path.join(__dirname, '../../frontend/src/abis');

console.log('Copying contract artifacts from backend to frontend...');

// Ensure frontend directories exist
if (!fs.existsSync(frontendArtifactsPath)) {
    fs.mkdirSync(frontendArtifactsPath, { recursive: true });
    console.log('Created frontend artifacts directory');
}

if (!fs.existsSync(frontendAbisPath)) {
    fs.mkdirSync(frontendAbisPath, { recursive: true });
    console.log('Created frontend abis directory');
}

let copiedCount = 0;
let errorCount = 0;

contracts.forEach(contractName => {
    const sourcePath = path.join(backendArtifactsPath, `${contractName}.sol`, `${contractName}.json`);
    const destPath = path.join(frontendArtifactsPath, `${contractName}.json`);
    const abiDestPath = path.join(frontendAbisPath, `${contractName}.json`);

    try {
        if (fs.existsSync(sourcePath)) {
            // Read the artifact
            const artifact = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

            // Write to both frontend locations
            fs.writeFileSync(destPath, JSON.stringify(artifact, null, 2));
            fs.writeFileSync(abiDestPath, JSON.stringify(artifact, null, 2));

            console.log(`✅ Copied ${contractName}.json`);
            copiedCount++;
        } else {
            console.log(`⚠️  Warning: ${sourcePath} not found`);
            errorCount++;
        }
    } catch (error) {
        console.error(`❌ Error copying ${contractName}.json:`, error.message);
        errorCount++;
    }
});

console.log(`\nSummary: Successfully copied ${copiedCount} files`);
if (errorCount > 0) {
    console.log(`Warnings/Errors: ${errorCount} files not found or failed to copy`);
}

if (copiedCount > 0) {
    console.log('✅ Contract artifacts copied successfully!');
} else {
    console.log('⚠️  No artifacts were copied. Make sure contracts are compiled first.');
}