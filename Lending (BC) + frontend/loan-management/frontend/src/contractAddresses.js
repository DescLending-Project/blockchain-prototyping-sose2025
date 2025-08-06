// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost: {
    "VotingToken": "0x445b447D170cde51757202f73565AC4e106f2f5d",
    "TimelockController": "0x072c3F82b0Ea835599c837f4ac389767d5E6cfE5",
    "ProtocolGovernor": "0x03DFbA546c7359df5e35B0717d98995AF44F15EE",
    "StablecoinManager": "0xafB277da2B4a887069e2906b61bd8819B99487D3",
    "InterestRateModel": "0x9E021638eba97506F7b8cEA0C9ee883458F05462",
    "LiquidityPool": "0xD360c07dC92e54EC3D2FEBc6bc6d51Af9d787D84",
    "LiquidityPoolCore": "0xD360c07dC92e54EC3D2FEBc6bc6d51Af9d787D84",
    "LiquidityPoolCollateral": "0x9066c968702c79c83EF174DAE83D951Ef5D47dce",
    "LendingManager": "0xB2c9157C58f6343F02C925adc410e552B4e5021a",
    "nullifierRegistry": "0x3364c8BD60f7262092D7Db0586a4E2D68bA295f0",
    "GlintToken": "0xD6e059369E1fabA3a684aBeB38CF1cE44F4d11a2",
    "MockPriceFeed": "0xa51D3223466c10276d47f59903f2fc042B2D8BA0",
    "MockPriceFeedUSDC": "0x0F09b94EDB5Adea18Bcb735359e46eDCaA5Eb54A",
    "MockPriceFeedUSDT": "0xe08EB60D0509d5b06F767429FE7386ed527260D7",
    "MockPriceFeedETH": "0x45c72D244067EA046c52A62BCeb6f543Ca9F3C17",
    "IntegratedCreditSystem": "0x1Ee8abC15030Da65808F33D76758709f62083A6a",
    "creditScoreVerifier": "0xE3F3a75ef923023FFeb9a502c3Bc7dF30c334B6a"
},
  sepolia: {
    // Add Sepolia addresses when deployed
    "VotingToken": "0x445b447D170cde51757202f73565AC4e106f2f5d",
    "TimelockController": "0x072c3F82b0Ea835599c837f4ac389767d5E6cfE5",
    "ProtocolGovernor": "0x03DFbA546c7359df5e35B0717d98995AF44F15EE",
    "StablecoinManager": "0xafB277da2B4a887069e2906b61bd8819B99487D3",
    "InterestRateModel": "0x9E021638eba97506F7b8cEA0C9ee883458F05462",
    "LiquidityPool": "0xD360c07dC92e54EC3D2FEBc6bc6d51Af9d787D84",
    "LiquidityPoolCore": "0xD360c07dC92e54EC3D2FEBc6bc6d51Af9d787D84",
    "LiquidityPoolCollateral": "0x9066c968702c79c83EF174DAE83D951Ef5D47dce",
    "LendingManager": "0xB2c9157C58f6343F02C925adc410e552B4e5021a",
    "nullifierRegistry": "0x3364c8BD60f7262092D7Db0586a4E2D68bA295f0",
    "GlintToken": "0xD6e059369E1fabA3a684aBeB38CF1cE44F4d11a2",
    "MockPriceFeed": "0xa51D3223466c10276d47f59903f2fc042B2D8BA0",
    "MockPriceFeedUSDC": "0x0F09b94EDB5Adea18Bcb735359e46eDCaA5Eb54A",
    "MockPriceFeedUSDT": "0xe08EB60D0509d5b06F767429FE7386ed527260D7",
    "MockPriceFeedETH": "0x45c72D244067EA046c52A62BCeb6f543Ca9F3C17",
    "IntegratedCreditSystem": "0x1Ee8abC15030Da65808F33D76758709f62083A6a",
    "creditScoreVerifier": "0xE3F3a75ef923023FFeb9a502c3Bc7dF30c334B6a"
  },
  sonic: {
    // Add Sonic addresses when deployed
  }
};

export const getContractAddresses = (networkName) => {
  return CONTRACT_ADDRESSES[networkName] || CONTRACT_ADDRESSES.localhost;
};
