const fs = require('fs');
const path = require('path');

// Contract names to copy
const contracts = [
    'LendingManager',
    'LiquidityPoolV3',
    'StablecoinManager'
];

// Paths
const backendArtifactsPath = path.join(__dirname, '../artifacts/contracts');
const frontendArtifactsPath = path.join(__dirname, '../../frontend/src');

console.log('Copying contract artifacts from backend to frontend...');

// Ensure frontend artifacts directory exists
if (!fs.existsSync(frontendArtifactsPath)) {
    fs.mkdirSync(frontendArtifactsPath, { recursive: true });
    console.log('Created frontend artifacts directory');
}

let copiedCount = 0;
let errorCount = 0;

contracts.forEach(contractName => {
    const sourcePath = path.join(backendArtifactsPath, `${contractName}.sol`, `${contractName}.json`);
    const destPath = path.join(frontendArtifactsPath, `${contractName}.json`);

    try {
        if (fs.existsSync(sourcePath)) {
            // Read the artifact
            const artifact = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

            // Write to frontend
            fs.writeFileSync(destPath, JSON.stringify(artifact, null, 2));

            console.log(`Copied ${contractName}.json`);
            copiedCount++;
        } else {
            console.log(`Warning: ${sourcePath} not found`);
            errorCount++;
        }
    } catch (error) {
        console.error(`Error copying ${contractName}.json:`, error.message);
        errorCount++;
    }
});

console.log(`Summary: Successfully copied ${copiedCount} files`);
if (errorCount > 0) {
    console.log(`Errors: ${errorCount} files`);
}

if (errorCount === 0) {
    console.log('All contract artifacts copied successfully!');
} else {
    console.log('Some artifacts could not be copied. Please check the errors above.');
    process.exit(1);
} 