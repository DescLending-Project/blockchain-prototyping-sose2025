const { ethers } = require('ethers');
require('dotenv').config();
const LiquidityPoolV3 = require('../artifacts/contracts/LiquidityPoolV3.sol/LiquidityPoolV3.json');

// Sonic network config
const SONIC_RPC_URL = process.env.SONIC_RPC_URL;
const ADMIN_PRIVATE_KEY = process.env.PRIVATE_KEY;
const POOL_ADDRESS = '0x1e69F5609b8123760020c4d3222607929644E679'; // Update if needed

// Sonic tokens and feeds
const SONIC_TOKENS = [
    {
        symbol: 'USDC',
        address: '0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6',
        priceFeed: '0x55bCa887199d5520B3Ce285D41e6dC10C08716C9',
    },
    {
        symbol: 'USDT',
        address: '0x6047828dc181963ba44974801ff68e538da5eaf9',
        priceFeed: '0x76F4C040A792aFB7F6dBadC7e30ca3EEa140D216',
    },
];

// Sepolia tokens to remove from Sonic allowed list
const SEPOLIA_TOKENS = [
    {
        symbol: 'USDC',
        address: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    },
    {
        symbol: 'USDT',
        address: '0x7169d38820dfd117c3fa1f22a697dba58d90ba06',
    },
];

async function main() {
    if (!SONIC_RPC_URL || !ADMIN_PRIVATE_KEY) {
        throw new Error('Set SONIC_RPC_URL and PRIVATE_KEY in your .env');
    }
    const provider = new ethers.JsonRpcProvider(SONIC_RPC_URL);
    const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(POOL_ADDRESS, LiquidityPoolV3.abi, wallet);

    // Remove Sepolia tokens from allowed list
    for (const token of SEPOLIA_TOKENS) {
        const isAllowed = await contract.isAllowedCollateral(token.address);
        if (isAllowed) {
            console.log(`Removing ${token.symbol} (${token.address}) from allowed collateral...`);
            const tx = await contract.setAllowedCollateral(token.address, false);
            await tx.wait();
            console.log(`  -> ${token.symbol} removed from allowed collateral.`);
        } else {
            console.log(`${token.symbol} (${token.address}) is not allowed, nothing to remove.`);
        }
    }

    // Existing logic for Sonic tokens...
    for (const token of SONIC_TOKENS) {
        // Check allowed collateral
        const isAllowed = await contract.isAllowedCollateral(token.address);
        if (!isAllowed) {
            console.log(`Setting ${token.symbol} as allowed collateral...`);
            const tx = await contract.setAllowedCollateral(token.address, true);
            await tx.wait();
            console.log(`  -> ${token.symbol} allowed as collateral.`);
        } else {
            console.log(`${token.symbol} already allowed as collateral.`);
        }

        // Check price feed
        let feed = ethers.ZeroAddress;
        try {
            feed = await contract.getPriceFeed(token.address);
        } catch (e) {
            // If not set, will throw
        }
        if (feed.toLowerCase() !== token.priceFeed.toLowerCase()) {
            console.log(`Setting price feed for ${token.symbol}...`);
            const tx = await contract.setPriceFeed(token.address, token.priceFeed);
            await tx.wait();
            console.log(`  -> Price feed set for ${token.symbol}.`);
        } else {
            console.log(`${token.symbol} already has correct price feed.`);
        }
    }
    console.log('Done!');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
}); 