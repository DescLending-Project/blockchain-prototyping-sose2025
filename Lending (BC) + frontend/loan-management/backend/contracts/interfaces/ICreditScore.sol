// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Interface for interacting with the RISC0 Credit Score Verifier Contract - moved this outside from the LiquidityPool
interface ICreditScore {
    
    function getCreditScore(address user) external view returns (
        uint64 score,
        bool isUnused,
        uint256 timestamp
    );

    function authorizeServer(string calldata serverName, bool authorized) external;
    
    function authorizeStateRootProvider(string calldata providerName, bool authorized) external;

    function markCreditScoreAsUsed(address user) external;

    // Events that might be useful to listen to
    event CreditScoreSubmitted(
        address indexed user,
        uint64 score,
        uint256 timestamp,
        bytes32 tradfiNullifier
    );
}