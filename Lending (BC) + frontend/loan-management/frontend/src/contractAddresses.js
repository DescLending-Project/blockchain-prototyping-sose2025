// This file is automatically updated by the deployment script
export const CONTRACT_ADDRESSES = {
  localhost:     {
        "VotingToken": "0x851356ae760d987E095750cCeb3bC6014560891C",
        "TimelockController": "0xf5059a5D33d5853360D16C683c16e67980206f36",
        "ProtocolGovernor": "0x95401dc811bb5740090279Ba06cfA8fcF6113778",
        "StablecoinManager": "0x1613beB3B2C4f22Ee086B2b38C1476A3cE7f78E8",
        "InterestRateModel": "0x8f86403A4DE0BB5791fa46B8e795C547942fE4Cf",
        "LiquidityPool": "0x9d4454B023096f34B160D6B654540c56A1F81688",
        "LendingManager": "0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00",
        "GlintToken": "0xa82fF9aFd8f496c3d6ac40E2a0F282E47488CFc9",
        "MockPriceFeed": "0xc5a5C42992dECbae36851359345FE25997F5C42d",
        "MockPriceFeedUSDC": "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
        "MockPriceFeedUSDT": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
        "IntegratedCreditSystem": "0x1291Be112d480055DaFd8a610b7d1e203891C274",
        "creditScoreVerifier": "0x1291Be112d480055DaFd8a610b7d1e203891C274",
        "risc0Test": "0x809d550fca64d94Bd9F66E60752A544199cfAC3D",
        "RiscZeroVerifier": "0x36C02dA8a0983159322a80FFE9F24b1acfF8B570",
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
