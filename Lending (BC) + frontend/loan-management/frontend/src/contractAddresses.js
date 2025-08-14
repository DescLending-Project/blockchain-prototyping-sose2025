// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost:     {
        "VotingToken": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        "TimelockController": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        "ProtocolGovernor": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
        "StablecoinManager": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        "InterestRateModel": "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f",
        "LiquidityPool": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
        "LendingManager": "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
        "GlintToken": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        "MockPriceFeed": "0xc5a5C42992dECbae36851359345FE25997F5C42d",
        "MockPriceFeedUSDC": "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
        "MockPriceFeedUSDT": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
        "IntegratedCreditSystem": "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
        "creditScoreVerifier": "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
        "risc0Test": "0x9A676e781A523b5d0C0e43731313A708CB607508",
        "RiscZeroVerifier": "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82",
        "CoralToken": "0xecc6f14f4b64eedd56111d80f46ce46933dc2d64"
    },
  sepolia: {
    // Add Sepolia addresses when deployed
  },
  sonic: {
    // Add Sonic addresses when deployed
  }
};

export const getContractAddresses = (networkName) => {
  return CONTRACT_ADDRESSES[networkName] || CONTRACT_ADDRESSES.localhost;
};
