require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    sonicTestnet: {
      url: process.env.SONIC_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 57054,
    },
  },
  etherscan: {
    apiKey: {
      sonicTestnet: process.env.SONIC_SCAN_API_KEY || "",
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
