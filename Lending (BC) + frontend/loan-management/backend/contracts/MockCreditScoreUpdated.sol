// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/interfaces/ICreditScore.sol";


// Updated mock contract implementing the ICreditScore interface and is used for testing

contract MockCreditScoreUpdated is ICreditScore {
    struct ScoreData {
        uint64 score;           // FICO score (300-850) - using uint64 to match interface
        bool isUnused;          // Whether this proof has been used for borrowing
        uint256 timestamp;      // When the score was set
    }
    
    mapping(address => ScoreData) private scores;
    mapping(string => bool) private authorizedServers;
    mapping(string => bool) private authorizedStateRootProviders;
    

    function setScore(address user, uint64 ficoScore, bool isUnused) external {
        scores[user] = ScoreData({
            score: ficoScore,
            isUnused: isUnused,
            timestamp: block.timestamp
        });
    }
    

    function setScoreWithTimestamp(
        address user, 
        uint64 ficoScore, 
        bool isUnused, 
        uint256 timestamp
    ) external {
        scores[user] = ScoreData({
            score: ficoScore,
            isUnused: isUnused,
            timestamp: timestamp
        });
    }
    

    function getCreditScore(address user) 
        external 
        view 
        override 
        returns (uint64 score, bool isUnused, uint256 timestamp) 
    {
        ScoreData memory data = scores[user];
        return (data.score, data.isUnused, data.timestamp);
    }
    

    function markCreditScoreAsUsed(address user) external override {
        // in real implementation, this has access controls
        require(scores[user].score > 0, "No score set for user");
        scores[user].isUnused = false;
    }
    

    function authorizeServer(string calldata serverName, bool authorized) external override {
        authorizedServers[serverName] = authorized;
    }
    

    function authorizeStateRootProvider(string calldata providerName, bool authorized) external override {
        authorizedStateRootProviders[providerName] = authorized;
    }
    

    function getScoreStatus(address user) 
        external 
        view 
        returns (bool hasScore, bool isUnused, bool isRecent) 
    {
        ScoreData memory data = scores[user];
        hasScore = data.score > 0;
        isUnused = data.isUnused;
        isRecent = block.timestamp <= data.timestamp + (90 days);
    }
    

    function isServerAuthorized(string calldata serverName) external view returns (bool authorized) {
        return authorizedServers[serverName];
    }
    

    function isStateRootProviderAuthorized(string calldata providerName) external view returns (bool authorized) {
        return authorizedStateRootProviders[providerName];
    }
    

    function resetScore(address user) external {
        delete scores[user];
    }
    
    
    // Reset all scores (test helper)
    
    function resetAllScores(address[] calldata users) external {
        for (uint i = 0; i < users.length; i++) {
            delete scores[users[i]];
        }
    }
}
