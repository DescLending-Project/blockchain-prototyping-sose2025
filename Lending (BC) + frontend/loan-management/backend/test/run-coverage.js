const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function runCoverage() {
    console.log('🚀 Starting comprehensive coverage tests...');

    try {
        // Clean previous coverage
        if (fs.existsSync('coverage')) {
            fs.rmSync('coverage', { recursive: true, force: true });
        }
        if (fs.existsSync('coverage.json')) {
            fs.unlinkSync('coverage.json');
        }

        // Compile contracts
        console.log('📦 Compiling contracts...');
        execSync('npx hardhat compile', { stdio: 'inherit' });

        // Run coverage
        console.log('🧪 Running coverage tests...');
        execSync('npx hardhat coverage --testfiles "test/AllContracts.coverage.test.js"', {
            stdio: 'inherit',
            env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' }
        });

        console.log('✅ Coverage tests completed successfully!');

    } catch (error) {
        console.error('❌ Coverage tests failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    runCoverage();
}

module.exports = { runCoverage };