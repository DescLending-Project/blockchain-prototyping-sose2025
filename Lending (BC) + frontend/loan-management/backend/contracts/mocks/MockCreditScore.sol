// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// MOCK CONTRACT AS VERIFIER CONTRACT IS IN OTHER DIRECTORY

contract MockCreditScore {
    struct Score {
        uint64 score;
        bool isValid;
        uint256 timestamp;
        bool isUsed; // For future usage tracking
    }
    
    mapping(address => Score) private scores;
    
    constructor() {}
    
    // Current interface used by LiquidityPool
    function getCreditScore(address user) 
        external 
        view 
        returns (
            uint64 score,
            bool isValid,
            uint256 timestamp
        ) 
    {
        Score memory userScore = scores[user];
        return (userScore.score, userScore.isValid, userScore.timestamp);
    }
    

    
    function setScore(address user, uint64 score, bool isValid) external {
        scores[user] = Score({
            score: score,
            isValid: isValid,
            timestamp: block.timestamp,
            isUsed: false
        });
    }
    
    function setScoreWithTimestamp(
        address user, 
        uint64 score, 
        bool isValid, 
        uint256 timestamp
    ) external {
        scores[user] = Score({
            score: score,
            isValid: isValid,
            timestamp: timestamp,
            isUsed: false
        });
    }
    
    function setUsageStatus(address user, bool isUsed) external {
        require(scores[user].isValid, "No valid score for user");
        scores[user].isUsed = isUsed;
    }
    
    function getFullScore(address user) 
        external 
        view 
        returns (Score memory) 
    {
        return scores[user];
    }
}
