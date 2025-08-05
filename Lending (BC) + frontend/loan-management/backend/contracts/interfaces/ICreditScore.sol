// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


// Interface for interacting with the RISC0 Credit Score Verifier Contract

interface ICreditScore {

    function getCreditScore(address user) external view returns (
        uint64 score,
        bool isValid,
        uint256 timestamp
    );

    function isServerAuthorized(string calldata serverName) external view returns (bool);


    function isStateRootProviderAuthorized(string calldata providerName) external view returns (bool);

    function SCORE_EXPIRY_PERIOD() external view returns (uint256);

    // Events that might be useful to listen to
    event CreditScoreSubmitted(
        address indexed user,
        uint64 score,
        string serverName,
        string stateRootProvider,
        uint256 timestamp
    );
}