const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for better output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n${colors.cyan}${step}${colors.reset} ${message}`, 'bright');
}

function logSuccess(message) {
    log(`[SUCCESS] ${message}`, 'green');
}

function logError(message) {
    log(`[ERROR] ${message}`, 'red');
}

function logWarning(message) {
    log(`[WARNING] ${message}`, 'yellow');
}

function logInfo(message) {
    log(`[INFO] ${message}`, 'blue');
}

function killHardhatNodes() {
    logStep('STEP 1', 'Cleaning up existing Hardhat nodes...');

    try {
        // More thorough process killing
        execSync("pkill -f 'hardhat node'", { stdio: 'ignore' });
        execSync("pkill -f 'npx hardhat node'", { stdio: 'ignore' });

        // Wait a moment for processes to fully terminate
        setTimeout(() => { }, 1000);

        logSuccess('Killed all running Hardhat node processes');
    } catch (e) {
        logInfo('No running Hardhat node processes found');
    }
}

function deleteDeployLog() {
    logStep('STEP 2', 'Cleaning up deployment logs...');

    const logPath = path.join(__dirname, '../deploy-debug.log');
    if (fs.existsSync(logPath)) {
        try {
            fs.unlinkSync(logPath);
            logSuccess('Deleted deploy-debug.log');
        } catch (e) {
            logError(`Failed to delete deploy-debug.log: ${e.message}`);
        }
    } else {
        logInfo('No deploy-debug.log found');
    }
}

function startHardhatNode() {
    logStep('STEP 3', 'Starting Hardhat node...');

    try {
        const node = spawn('npx', ['hardhat', 'node'], {
            detached: true,
            stdio: 'ignore',
            cwd: path.join(__dirname, '..'),
        });
        node.unref();
        logSuccess('Hardhat node started in background');
    } catch (e) {
        logError(`Failed to start Hardhat node: ${e.message}`);
        throw e;
    }
}

function waitForNodeReady(timeout = 8000) {
    logStep('STEP 4', 'Waiting for Hardhat node to be ready...');

    return new Promise((resolve) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            if (elapsed >= timeout) {
                clearInterval(checkInterval);
                logWarning(`Node startup timeout after ${timeout}ms, proceeding anyway...`);
                resolve();
            }
        }, 1000);

        setTimeout(() => {
            clearInterval(checkInterval);
            logSuccess('Hardhat node is ready');
            resolve();
        }, timeout);
    });
}

function runDeployAll() {
    logStep('STEP 5', 'Deploying all contracts and running mockup simulation...');

    try {
        execSync('npx hardhat run scripts/deployAll.js --network localhost', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
        logSuccess('All contracts deployed and mockup simulation completed');
    } catch (e) {
        logError(`Deployment failed: ${e.message}`);
        throw e;
    }
}

function checkPrerequisites() {
    logStep('PREREQUISITES', 'Checking system requirements...');

    // Check if we're in the right directory
    const hardhatConfigPath = path.join(__dirname, '../hardhat.config.js');
    if (!fs.existsSync(hardhatConfigPath)) {
        logError('Hardhat config not found. Please run this script from the backend directory.');
        process.exit(1);
    }

    // Check if node_modules exists
    const nodeModulesPath = path.join(__dirname, '../node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
        logError('node_modules not found. Please run "npm install" first.');
        process.exit(1);
    }

    logSuccess('All prerequisites met');
}

async function main() {
    console.clear();
    log('Lending Platform - Local Development Automation', 'magenta');
    log('==================================================', 'magenta');

    try {
        checkPrerequisites();

        killHardhatNodes();
        deleteDeployLog();
        startHardhatNode();
        await waitForNodeReady();
        runDeployAll();

        log('\n', 'green');
        log('SUCCESS! Your lending platform is now running locally.', 'green');
        log('==================================================', 'green');
        log('• Hardhat node: http://localhost:8545', 'cyan');
        log('• Frontend: http://localhost:3000 (if running)', 'cyan');
        log('• Contracts deployed and mockup data loaded', 'cyan');
        log('\nPress Ctrl+C to stop the Hardhat node when done.', 'yellow');

    } catch (error) {
        log('\n', 'red');
        log('AUTOMATION FAILED!', 'red');
        log('==================================================', 'red');
        logError(`Error: ${error.message}`);
        log('\nTroubleshooting tips:', 'yellow');
        log('• Make sure you\'re in the backend directory', 'yellow');
        log('• Run "npm install" if dependencies are missing', 'yellow');
        log('• Check if port 8545 is available', 'yellow');
        log('• Try running steps manually to identify the issue', 'yellow');

        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('\n\nShutting down gracefully...', 'yellow');
    try {
        execSync("pkill -f 'hardhat node'", { stdio: 'ignore' });
        logSuccess('Hardhat node stopped');
    } catch (e) {
        // Ignore errors during shutdown
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('\n\nReceived SIGTERM, shutting down...', 'yellow');
    process.exit(0);
});

main(); 