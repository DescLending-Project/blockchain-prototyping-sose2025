// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost: {
    "VotingToken": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    "TimelockController": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "ProtocolGovernor": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    "StablecoinManager": "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
    "InterestRateModel": "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
    "LiquidityPool": "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE",
    "LendingManager": "0x68B1D87F95878fE05B998F19b66F4baba5De1aed",
    "GlintToken": "0xc5a5C42992dECbae36851359345FE25997F5C42d",
    "MockPriceFeed": "0x67d269191c92Caf3cD7723F116c85e6E9bf55933",
    "MockPriceFeedUSDC": "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
    "MockPriceFeedUSDT": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    "IntegratedCreditSystem": "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82",
    "creditScoreVerifier": "0xE3F3a75ef923023FFeb9a502c3Bc7dF30c334B6a",
    "nullifierRegistry": "0x3364c8BD60f7262092D7Db0586a4E2D68bA295f0"
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
