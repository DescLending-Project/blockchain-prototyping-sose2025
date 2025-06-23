const fs = require('fs');
const path = require('path');

// Network-specific token addresses
const NETWORK_TOKENS = {
    'sepolia': {
        usdc: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
        usdt: '0x7169d38820dfd117c3fa1f22a697dba58d90ba06'
    },
    'sonic': {
        usdc: '0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6',
        usdt: '0x6047828dc181963ba44974801ff68e538da5eaf9'
    },
    'mainnet': {
        usdc: '0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8',
        usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
    }
};

function updateTokenAddress(content, symbol, newAddress) {
    // Regex: find the address field inside the object with symbol: 'SYMBOL'
    // This matches { ... address: '...', ... symbol: 'SYMBOL', ... }
    // and only replaces the address inside the same object
    const regex = new RegExp(
        `(\{[^}]*?address:\s*['"])\w+(['"].*?symbol:\s*['"]${symbol}['"][^}]*?\})`,
        'gs'
    );
    return content.replace(regex, `$1${newAddress}$2`);
}

function updateTokenAddressBySymbol(content, symbol, newAddress) {
    // Match the address field in the object where symbol: 'SYMBOL' (allowing comments/fields in between)
    const regex = new RegExp(
        `(address:\s*['\"]).*?(['\"].*?symbol:\s*['\"]${symbol}['\"])`,
        's'
    );
    return content.replace(regex, `$1${newAddress}$2`);
}

function updateTokenAddressInNetwork(content, network, symbol, newAddress) {
    // Step 1: Find the array for the correct network (global, multiline)
    const arrayRegex = new RegExp(`(${network}:\s*\[)([\s\S]*?)(\])`, 'gm');
    const match = arrayRegex.exec(content);
    if (!match) return content; // Network array not found
    const arrayStart = match[1];
    const arrayContent = match[2];
    const arrayEnd = match[3];

    // Step 2: Replace the address for the correct symbol in the array content
    // Only match address field in the object with the correct symbol
    const tokenRegex = new RegExp(
        `(address:\s*['"])[^'"]+(['"][^}]*symbol:\s*['"]${symbol}['"])`,
        'gs'
    );
    const updatedArrayContent = arrayContent.replace(tokenRegex, `$1${newAddress}$2`);

    // Step 3: Replace only the array content in the file
    const updatedContent = content.replace(arrayRegex, `${arrayStart}${updatedArrayContent}${arrayEnd}`);
    return updatedContent;
}

function updateAppAddresses(deploymentData) {
    const appJsxPath = path.join(__dirname, '../../frontend/src/App.jsx');
    console.log('DEBUG: Using App.jsx path:', appJsxPath);

    try {
        if (!fs.existsSync(appJsxPath)) {
            console.error('App.jsx not found at path:', appJsxPath);
            return false;
        }

        let content = fs.readFileSync(appJsxPath, 'utf8');
        console.log('\nOriginal contract addresses:');
        console.log('POOL_ADDRESS:', content.match(/const POOL_ADDRESS = '([^']+)'/)?.[1]);
        console.log('LENDING_MANAGER_ADDRESS:', content.match(/const LENDING_MANAGER_ADDRESS = '([^']+)'/)?.[1]);

        // Update the contract addresses
        content = content.replace(
            /(const POOL_ADDRESS = ')[^']+(')/,
            `$1${deploymentData.liquidityPoolV3Address}$2`
        );
        content = content.replace(
            /(const LENDING_MANAGER_ADDRESS = ')[^']+(')/,
            `$1${deploymentData.lendingManagerAddress}$2`
        );

        // Update CONTRACT_ADDRESSES for both networks
        ['sepolia', 'sonic'].forEach(network => {
            content = content.replace(
                new RegExp(`(${network}:\\s*{[^}]*pool:\\s*')[^']*(')`, 'm'),
                `$1${deploymentData.liquidityPoolV3Address}$2`
            );
            content = content.replace(
                new RegExp(`(${network}:\\s*{[^}]*lending:\\s*')[^']*(')`, 'm'),
                `$1${deploymentData.lendingManagerAddress}$2`
            );
        });

        // Update token addresses in COLLATERAL_TOKENS array
        if (deploymentData.tokens) {
            Object.entries(deploymentData.tokens).forEach(([symbol, address]) => {
                const regex = new RegExp(`(address:\\s*['"])[^'"]*(['"][^}]*symbol:\\s*['"]${symbol}['"])`, 'gs');
                content = content.replace(regex, `$1${address}$2`);
            });
        }

        // Write the updated content back to the file
        fs.writeFileSync(appJsxPath, content);

        // Verify the updates
        const updatedContent = fs.readFileSync(appJsxPath, 'utf8');
        console.log('\nUpdated contract addresses:');
        console.log('POOL_ADDRESS:', updatedContent.match(/const POOL_ADDRESS = '([^']+)'/)?.[1]);
        console.log('LENDING_MANAGER_ADDRESS:', updatedContent.match(/const LENDING_MANAGER_ADDRESS = '([^']+)'/)?.[1]);

        return true;
    } catch (error) {
        console.error('Error updating App.jsx:', error);
        return false;
    }
}

module.exports = { updateAppAddresses }; 