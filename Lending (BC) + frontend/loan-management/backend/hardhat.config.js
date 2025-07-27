require('solidity-coverage');
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

module.exports = {
    solidity: {
        compilers: [
            {
                version: "0.8.24",
                settings: {
                    viaIR: true,
                    optimizer: {
                        enabled: true,
                        runs: 200
                    },
                    evmVersion: "cancun"
                }
            },
            {
                version: "0.8.20",
                settings: {
                    viaIR: true,
                    optimizer: {
                        enabled: true,
                        runs: 200
                    },
                    evmVersion: "cancun"
                }
            }
        ]
    },
    networks: {
        coverage: {
            url: "http://127.0.0.1:8545",
            gas: 0xfffffffffff,
            gasPrice: 0x01,
            blockGasLimit: 0xfffffffffff,
            allowUnlimitedContractSize: true,
            timeout: 300000
        },
        sonicTestnet: {
            url: process.env.SONIC_RPC_URL || "",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 57054,
        },
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/896658bbb69c4f788598d32fbdbdb937",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 11155111,
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            gas: 30000000,
            blockGasLimit: 50000000,
            allowUnlimitedContractSize: true,
        },
        hardhat: {
            blockGasLimit: 30_000_000,
            allowUnlimitedContractSize: true,
            hardfork: "cancun"
        },
    },
    gasReporter: {
        enabled: true
    },
    mocha: {
        timeout: 600000
    },
    etherscan: {
        apiKey: {
            sonicTestnet: process.env.SONIC_SCAN_API_KEY || "",
            sepolia: process.env.ETHERSCAN_API_KEY || "",
        },
        customChains: [
            {
                network: "sonicTestnet",
                chainId: 57054,
                urls: {
                    apiURL: "https://api-testnet.sonicscan.org/api",
                    browserURL: "https://testnet.sonicscan.org",
                },
            },
        ],
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    }
}; 
