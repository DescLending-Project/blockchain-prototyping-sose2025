// Chain ID to Network mapping
export const CHAIN_ID_TO_NETWORK = {
    1: 'mainnet',
    11155111: 'sepolia',
    57054: 'sonic',
    1337: 'localhost',
    31337: 'localhost' // Hardhat uses the same chain ID as localhost
};

// Contract addresses for each network
export const CONTRACT_ADDRESSES = {
    sepolia: {
        pool: '0xB2B051D52e816305BbB37ee83A2dB4aFaae0c55C',
        lending: '0x59a0f2A32F34633Cef830EAe11BF41801C4a2F0C'
    },
    sonic: {
        pool: '0xB2B051D52e816305BbB37ee83A2dB4aFaae0c55C',
        lending: '0x59a0f2A32F34633Cef830EAe11BF41801C4a2F0C'
    },
    localhost: {
        pool: '0x9d4454B023096f34B160D6B654540c56A1F81688', // LiquidityPool address from addresses.json
        lending: '0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00' // LendingManager address from addresses.json
    },
    mainnet: {
        pool: '',  // To be filled when deploying to mainnet
        lending: '' // To be filled when deploying to mainnet
    }
};

// Default network to use if network detection fails
export const DEFAULT_NETWORK = 'localhost'; // Changed to localhost for development

// Network specific configuration
export const NETWORK_CONFIG = {
    sepolia: {
        chainId: '0xaa36a7',
        chainName: 'Sepolia',
        nativeCurrency: {
            name: 'Sepolia Ether',
            symbol: 'ETH',
            decimals: 18
        },
        rpcUrls: ['https://sepolia.infura.io/v3/'],
        blockExplorerUrls: ['https://sepolia.etherscan.io']
    },
    sonic: {
        chainId: '0xDEAE',
        chainName: 'SONIC',
        nativeCurrency: {
            name: 'SONIC',
            symbol: 'SONIC',
            decimals: 18
        },
        rpcUrls: ['https://rpc.sonic.org/'],
        blockExplorerUrls: ['https://explorer.sonic.org']
    },
    localhost: {
        chainId: '0x7a69', // 31337 in hex
        chainName: 'Localhost',
        nativeCurrency: {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18
        },
        rpcUrls: ['http://localhost:8545'],
        blockExplorerUrls: []
    }
};