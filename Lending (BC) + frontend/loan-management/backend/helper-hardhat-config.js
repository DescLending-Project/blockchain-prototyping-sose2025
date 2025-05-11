const { utils } = require("ethers");

const networkConfig = {
    hardhat: {
        name: "hardhat",
    },
    57054: {
        name: "sonicTestnet",
    },
};

const developmentChains = ["hardhat", "localhost"];
const VERIFICATION_BLOCK_CONFIRMATIONS = 6;

module.exports = {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
};