// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost: {
    "VotingToken": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    "TimelockController": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "ProtocolGovernor": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    "StablecoinManager": "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
    "InterestRateModel": "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
    "LiquidityPool": "0x0B306BF915C4d645ff596e518fAf3F9669b97016",
    "LendingManager": "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
    "GlintToken": "0x59b670e9fA9D0A427751Af201D676719a970857b",
    "MockPriceFeed": "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1",
    "MockPriceFeedUSDC": "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
    "MockPriceFeedUSDT": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
    "IntegratedCreditSystem": "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82"
},
  sepolia: {
    // Add Sepolia addresses when deployed
    "VotingToken": "0x649BEDB7e135feB48B94DA42be428b6AD16a25E4",
    "TimelockController": "0x8833506Eb035f01c1FC1C3CE81c1D78294D5F59c",
    "ProtocolGovernor": "0x1069B4CdA3E4ECE5a64545E7AabC22F7A545662A",
    "StablecoinManager": "0x484A682A3f7601B83470E2E7F1486895a6907D82",
    "InterestRateModel": "0x62Ab36b011573F4cB5B0f87b1431bB4609bae49C",
    "LiquidityPool": "0x9dB8EbdcFFa382d6F10399b0fe5E4Bfeb235e498",
    "LendingManager": "0xfc3cF44709cD4809E80D4083a18a8168d5f80971",
    "GlintToken": "0xd460D931f3F4c7433Af8FbdDCF87b990C631E5d3",
    "MockPriceFeed (Glint)": "0x70B9AF303cbE4751f756266960a969e702D770a5",
    "MockPriceFeed USDC": "0xD8efb39Bf8f1156be174C8B810F69E590606740b",
    "MockPriceFeed USDT": "0x290a24Ae5E2AA0EeBeadf65E6AF76FD6f687835c",
    "IntegratedCreditSystem": "0x36fBCF3c0C8DC8A7930aC0cb29c839acc552ABCE"

  },
  sonic: {
    // Add Sonic addresses when deployed
  }
};

export const getContractAddresses = (networkName) => {
  return CONTRACT_ADDRESSES[networkName] || CONTRACT_ADDRESSES.localhost;
};
