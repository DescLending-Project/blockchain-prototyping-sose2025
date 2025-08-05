// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost: {
    "VotingToken": "0x25e941f166c1d66C3f28af6cEa8EA465772EE1a6",
    "TimelockController": "0xb38180DBd8090c0f0136E78FB1A93654f6f3f481",
    "ProtocolGovernor": "0x61c46a5c20f3D784E3aC2e101021be7fc9E1d5CA",
    "StablecoinManager": "0x9fB31F93427C02115894fab862276322F99cEF07",
    "InterestRateModel": "0x99E8Dd36081Cae946964B5F4b261fE4fACE18ed1",
    "LiquidityPool": "0x4a95320F2B6368B5a5fF0b10562481AeA99d6D39",
    "LendingManager": "0x04Eed63A8531c4281F58B466337D6675e3dE5dCE",
    "GlintToken": "0xdDE6E8896a39b9b79769Cd1C4543049F1eAa39d4",
    "MockPriceFeed": "0x8620a5ffD787b8bB66aB9FD876A6bd18adF39AD1",
    "MockPriceFeedUSDC": "0xAEac90f45a46458cdE517d380b9592D34E28a6aB",
    "MockPriceFeedUSDT": "0x2bDc52d037b7E8A5d98B387eF904b7b9dDB7D77C",
    "IntegratedCreditSystem": "0x06ae7e9CB04A60347547a47124E65CE2985304f1",
    "creditScoreVerifier": "0xE3F3a75ef923023FFeb9a502c3Bc7dF30c334B6a"
},
  sepolia: {
    // Add Sepolia addresses when deployed
        "VotingToken": "0x25e941f166c1d66C3f28af6cEa8EA465772EE1a6",
    "TimelockController": "0xb38180DBd8090c0f0136E78FB1A93654f6f3f481",
    "ProtocolGovernor": "0x61c46a5c20f3D784E3aC2e101021be7fc9E1d5CA",
    "StablecoinManager": "0x9fB31F93427C02115894fab862276322F99cEF07",
    "InterestRateModel": "0x99E8Dd36081Cae946964B5F4b261fE4fACE18ed1",
    "LiquidityPool": "0x4a95320F2B6368B5a5fF0b10562481AeA99d6D39",
    "LendingManager": "0x04Eed63A8531c4281F58B466337D6675e3dE5dCE",
    "GlintToken": "0xdDE6E8896a39b9b79769Cd1C4543049F1eAa39d4",
    "MockPriceFeed": "0x8620a5ffD787b8bB66aB9FD876A6bd18adF39AD1",
    "MockPriceFeedUSDC": "0xAEac90f45a46458cdE517d380b9592D34E28a6aB",
    "MockPriceFeedUSDT": "0x2bDc52d037b7E8A5d98B387eF904b7b9dDB7D77C",
    "IntegratedCreditSystem": "0x06ae7e9CB04A60347547a47124E65CE2985304f1",
    "creditScoreVerifier": "0xE3F3a75ef923023FFeb9a502c3Bc7dF30c334B6a"
  },
  sonic: {
    // Add Sonic addresses when deployed
  }
};

export const getContractAddresses = (networkName) => {
  return CONTRACT_ADDRESSES[networkName] || CONTRACT_ADDRESSES.localhost;
};
