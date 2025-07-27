// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost: {
    "VotingToken": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    "TimelockController": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "ProtocolGovernor": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    "StablecoinManager": "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
    "InterestRateModel": "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
    "LiquidityPool": "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
    "LendingManager": "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE",
    "GlintToken": "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1",
    "MockPriceFeed": "0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44",
    "MockPriceFeedUSDC": "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
    "MockPriceFeedUSDT": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    "IntegratedCreditSystem": "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82"
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
