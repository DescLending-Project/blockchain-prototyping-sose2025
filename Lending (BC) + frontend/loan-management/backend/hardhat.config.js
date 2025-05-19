require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

module.exports = {
  solidity: "0.8.28",
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
};
