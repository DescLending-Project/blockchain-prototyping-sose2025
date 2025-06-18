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
    // Match the address field in the object where symbol: 'SYMBOL' (allowing comments/fields in between)
    const regex = new RegExp(
        `(address: ['"])[^'"]+(['"].*?symbol: ['"]${symbol}['"])`,
        's'
    );
    return content.replace(regex, `$1${newAddress}$2`);
}

function updateAppAddresses(deploymentData, networkName = 'sepolia') {
    const appJsxPath = path.join(__dirname, '../../frontend/src/App.jsx');

    if (!fs.existsSync(appJsxPath)) {
        console.error('App.jsx not found at:', appJsxPath);
        return false;
    }

    try {
        // Read the current App.jsx file
        let content = fs.readFileSync(appJsxPath, 'utf8');

        // Update CONTRACT_ADDRESS (LiquidityPoolV3)
        const contractAddressRegex = /const CONTRACT_ADDRESS = ['"]([^'"]+)['"]/;
        if (contractAddressRegex.test(content)) {
            content = content.replace(contractAddressRegex, `const CONTRACT_ADDRESS = '${deploymentData.liquidityPoolV3Address}'`);
            console.log('Updated CONTRACT_ADDRESS');
        } else {
            console.log('Could not find CONTRACT_ADDRESS in App.jsx');
        }

        // Add LendingManager address if it doesn't exist
        const lendingManagerAddressRegex = /const LENDING_MANAGER_ADDRESS = ['"]([^'"]+)['"]/;
        if (lendingManagerAddressRegex.test(content)) {
            content = content.replace(lendingManagerAddressRegex, `const LENDING_MANAGER_ADDRESS = '${deploymentData.lendingManagerAddress}'`);
            console.log('Updated LENDING_MANAGER_ADDRESS');
        } else {
            // Add LendingManager address after CONTRACT_ADDRESS
            const contractAddressLineRegex = /(const CONTRACT_ADDRESS = ['"][^'"]+['"])/;
            content = content.replace(contractAddressLineRegex, `$1\nconst LENDING_MANAGER_ADDRESS = '${deploymentData.lendingManagerAddress}'`);
            console.log('Added LENDING_MANAGER_ADDRESS');
        }

        // Update GLINT token address
        content = updateTokenAddress(content, 'GLINT', deploymentData.glintTokenAddress);
        // Get network-specific stablecoin addresses
        const networkTokens = NETWORK_TOKENS[networkName] || NETWORK_TOKENS['sepolia'];
        // Update USDC token address based on network
        const usdcAddress = deploymentData.usdcTokenAddress || networkTokens.usdc;
        content = updateTokenAddress(content, 'USDC', usdcAddress);
        // Update USDT token address based on network
        const usdtAddress = deploymentData.usdtTokenAddress || networkTokens.usdt;
        content = updateTokenAddress(content, 'USDT', usdtAddress);

        // Add a comment about the network
        const networkCommentRegex = /\/\/ Network: .*/;
        const networkComment = `// Network: ${networkName}`;
        if (networkCommentRegex.test(content)) {
            content = content.replace(networkCommentRegex, networkComment);
        } else {
            // Add network comment after the CONTRACT_ADDRESS line
            const contractAddressLineRegex = /(const CONTRACT_ADDRESS = ['"][^'"]+['"])/;
            content = content.replace(contractAddressLineRegex, `$1\n\n${networkComment}`);
        }

        // Write the updated content back to the file
        fs.writeFileSync(appJsxPath, content, 'utf8');
        console.log('Successfully updated App.jsx with new contract addresses');
        console.log(`Network: ${networkName}`);
        console.log(`LiquidityPoolV3: ${deploymentData.liquidityPoolV3Address}`);
        console.log(`LendingManager: ${deploymentData.lendingManagerAddress}`);
        console.log(`GLINT: ${deploymentData.glintTokenAddress}`);
        console.log(`USDC: ${usdcAddress}`);
        console.log(`USDT: ${usdtAddress}`);

        return true;
    } catch (error) {
        console.error('Error updating App.jsx:', error.message);
        return false;
    }
}

module.exports = { updateAppAddresses }; 