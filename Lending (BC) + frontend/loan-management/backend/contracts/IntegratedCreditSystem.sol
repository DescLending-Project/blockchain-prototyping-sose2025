// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimpleRISC0Test.sol";
import "./LiquidityPoolV3.sol";

/// @title Integrated Credit Verification System
/// @notice Connects RISC Zero proof verification with DeFi lending protocol
/// @dev Integrates credit verification with automatic lending term updates
contract IntegratedCreditSystem {
    
    // Core contracts
    SimpleRISC0Test public immutable risc0Verifier;
    LiquidityPoolV3 public liquidityPool;
    
    // Credit verification tracking
    struct UserCreditProfile {
        // Verification status
        bool hasTradFiVerification;
        bool hasAccountVerification; 
        bool hasNestingVerification;
        
        // Verification timestamps
        uint256 tradFiTimestamp;
        uint256 accountTimestamp;
        uint256 nestingTimestamp;
        
        // Calculated scores
        uint256 tradFiScore;      // 0-100 from TradFi verification
        uint256 accountScore;     // 0-100 from on-chain history
        uint256 hybridScore;      // 0-100 from nesting proof
        uint256 finalCreditScore; // Final computed score
        
        // Verification metadata
        string tradFiDataSource;
        uint256 lastScoreUpdate;
        bool isEligibleForBorrowing;
    }
    
    mapping(address => UserCreditProfile) public creditProfiles;
    
    // System configuration
    uint256 public constant VERIFICATION_VALIDITY_PERIOD = 30 days;
    uint256 public constant MIN_CREDIT_SCORE = 25; // Minimum score to borrow
    
    // Scoring weights (total must equal 100)
    uint256 public tradFiWeight = 50;     // 50% weight for TradFi verification
    uint256 public accountWeight = 30;    // 30% weight for account history
    uint256 public nestingWeight = 20;    // 20% weight for hybrid verification
    
    // Events
    event CreditVerificationCompleted(
        address indexed user,
        string verificationType,
        uint256 score,
        uint256 timestamp
    );
    
    event CreditScoreUpdated(
        address indexed user,
        uint256 oldScore,
        uint256 newScore,
        bool borrowingEligible
    );
    
    event BorrowingEligibilityChanged(
        address indexed user,
        bool eligible,
        uint256 creditScore
    );
    
    constructor(
        address _risc0Verifier,
        address _liquidityPool
    ) {
        risc0Verifier = SimpleRISC0Test(_risc0Verifier);
        liquidityPool = LiquidityPoolV3(payable(_liquidityPool));
    }
    
    /// @notice Submit TradFi verification proof
    /// @param seal RISC Zero proof seal
    /// @param journalData Journal data from the proof
    function submitTradFiProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        // Verify the proof (will revert if invalid)
        risc0Verifier.testTradFiProof(seal, journalData);
        
        // Calculate TradFi score based on proof data
        uint256 score = _calculateTradFiScore(journalData);
        
        // Update user's credit profile
        UserCreditProfile storage profile = creditProfiles[msg.sender];
        profile.hasTradFiVerification = true;
        profile.tradFiTimestamp = block.timestamp;
        profile.tradFiScore = score;
        profile.tradFiDataSource = "RISC0-TLSN"; // Could extract from journal
        
        emit CreditVerificationCompleted(msg.sender, "TradFi", score, block.timestamp);
        
        // Recalculate final credit score
        _updateFinalCreditScore(msg.sender);
    }
    
    /// @notice Submit account history verification proof
    /// @param seal RISC Zero proof seal
    /// @param journalData Journal data from the proof
    function submitAccountProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        // Verify the proof
        risc0Verifier.testAccountProof(seal, journalData);
        
        // Calculate account score based on proof data
        uint256 score = _calculateAccountScore(journalData);
        
        // Update user's credit profile
        UserCreditProfile storage profile = creditProfiles[msg.sender];
        profile.hasAccountVerification = true;
        profile.accountTimestamp = block.timestamp;
        profile.accountScore = score;
        
        emit CreditVerificationCompleted(msg.sender, "Account", score, block.timestamp);
        
        // Recalculate final credit score
        _updateFinalCreditScore(msg.sender);
    }
    
    /// @notice Submit hybrid nesting verification proof
    /// @param seal RISC Zero proof seal  
    /// @param journalData Journal data from the proof
    function submitNestingProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        // Verify the proof
        risc0Verifier.testNestingProof(seal, journalData);
        
        // Calculate hybrid score based on proof data
        uint256 score = _calculateHybridScore(journalData);
        
        // Update user's credit profile
        UserCreditProfile storage profile = creditProfiles[msg.sender];
        profile.hasNestingVerification = true;
        profile.nestingTimestamp = block.timestamp;
        profile.hybridScore = score;
        
        emit CreditVerificationCompleted(msg.sender, "Nesting", score, block.timestamp);
        
        // Recalculate final credit score
        _updateFinalCreditScore(msg.sender);
    }
    
    /// @notice Calculate and update user's final credit score
    function _updateFinalCreditScore(address user) internal {
        UserCreditProfile storage profile = creditProfiles[user];
        
        uint256 weightedScore = 0;
        uint256 totalWeight = 0;
        
        // Add TradFi score if available and valid
        if (profile.hasTradFiVerification && _isVerificationValid(profile.tradFiTimestamp)) {
            weightedScore += profile.tradFiScore * tradFiWeight;
            totalWeight += tradFiWeight;
        }
        
        // Add account score if available and valid
        if (profile.hasAccountVerification && _isVerificationValid(profile.accountTimestamp)) {
            weightedScore += profile.accountScore * accountWeight;
            totalWeight += accountWeight;
        }
        
        // Add nesting score if available and valid
        if (profile.hasNestingVerification && _isVerificationValid(profile.nestingTimestamp)) {
            weightedScore += profile.hybridScore * nestingWeight;
            totalWeight += nestingWeight;
        }
        
        // Calculate final score
        uint256 oldScore = profile.finalCreditScore;
        uint256 newScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
        
        // Update profile
        profile.finalCreditScore = newScore;
        profile.lastScoreUpdate = block.timestamp;
        
        // Check borrowing eligibility
        bool wasEligible = profile.isEligibleForBorrowing;
        bool nowEligible = newScore >= MIN_CREDIT_SCORE && totalWeight >= 50; // Require at least 50% weight
        profile.isEligibleForBorrowing = nowEligible;
        
        // Update liquidity pool with new credit score
        if (newScore > 0) {
            liquidityPool.updateCreditScoreFromZK(user, newScore);
        }
        
        // Emit events
        emit CreditScoreUpdated(user, oldScore, newScore, nowEligible);
        
        if (wasEligible != nowEligible) {
            emit BorrowingEligibilityChanged(user, nowEligible, newScore);
        }
    }
    
    /// @notice Calculate TradFi score from journal data
    function _calculateTradFiScore(bytes calldata journalData) internal pure returns (uint256) {
        // For now, use a simple calculation
        // In production, parse the actual journal data to extract credit info
        
        // Simulate extracting credit score from journal
        // Journal format: {"creditScore": 750, "dataSource": "experian.com", ...}
        
        // Simple mapping: if journal contains data, assume good score
        if (journalData.length > 100) {
            return 75; // Good TradFi score
        } else if (journalData.length > 50) {
            return 60; // Moderate score
        } else {
            return 40; // Basic score
        }
    }
    
    /// @notice Calculate account score from journal data
    function _calculateAccountScore(bytes calldata journalData) internal pure returns (uint256) {
        // Parse account verification data
        // Journal format: {"balance": "1.5", "nonce": 150, "age": 365, ...}
        
        uint256 baseScore = 30; // Base score for having a verified account
        
        // Add bonus based on journal data size (proxy for account activity)
        if (journalData.length > 200) {
            baseScore += 40; // High activity account
        } else if (journalData.length > 100) {
            baseScore += 25; // Moderate activity
        } else {
            baseScore += 10; // Basic activity
        }
        
        return baseScore > 100 ? 100 : baseScore;
    }
    
    /// @notice Calculate hybrid score from nesting proof
    function _calculateHybridScore(bytes calldata journalData) internal pure returns (uint256) {
        // Nesting proofs combine TradFi + DeFi data
        // Should have the highest confidence
        
        if (journalData.length > 150) {
            return 85; // Excellent hybrid score
        } else if (journalData.length > 75) {
            return 70; // Good hybrid score
        } else {
            return 55; // Moderate hybrid score
        }
    }
    
    /// @notice Check if verification is still valid
    function _isVerificationValid(uint256 timestamp) internal view returns (bool) {
        return block.timestamp <= timestamp + VERIFICATION_VALIDITY_PERIOD;
    }
    
    /// @notice Get user's complete credit profile
    function getUserCreditProfile(address user) 
        external 
        view 
        returns (
            bool hasTradFi,
            bool hasAccount,
            bool hasNesting,
            uint256 finalScore,
            bool isEligible,
            uint256 lastUpdate
        ) 
    {
        UserCreditProfile memory profile = creditProfiles[user];
        
        hasTradFi = profile.hasTradFiVerification && _isVerificationValid(profile.tradFiTimestamp);
        hasAccount = profile.hasAccountVerification && _isVerificationValid(profile.accountTimestamp);
        hasNesting = profile.hasNestingVerification && _isVerificationValid(profile.nestingTimestamp);
        finalScore = profile.finalCreditScore;
        isEligible = profile.isEligibleForBorrowing;
        lastUpdate = profile.lastScoreUpdate;
    }
    
    /// @notice Get detailed verification status
    function getVerificationDetails(address user)
        external
        view
        returns (
            uint256 tradFiScore,
            uint256 accountScore, 
            uint256 hybridScore,
            string memory dataSource,
            uint256[] memory timestamps
        )
    {
        UserCreditProfile memory profile = creditProfiles[user];
        
        tradFiScore = profile.tradFiScore;
        accountScore = profile.accountScore;
        hybridScore = profile.hybridScore;
        dataSource = profile.tradFiDataSource;
        
        timestamps = new uint256[](3);
        timestamps[0] = profile.tradFiTimestamp;
        timestamps[1] = profile.accountTimestamp;
        timestamps[2] = profile.nestingTimestamp;
    }
    
    /// @notice Admin function to update scoring weights
    function updateScoringWeights(
        uint256 _tradFiWeight,
        uint256 _accountWeight,
        uint256 _nestingWeight
    ) external {
        require(liquidityPool.owner() == msg.sender, "Only pool owner");
        require(_tradFiWeight + _accountWeight + _nestingWeight == 100, "Weights must sum to 100");
        
        tradFiWeight = _tradFiWeight;
        accountWeight = _accountWeight;
        nestingWeight = _nestingWeight;
    }
    
    /// @notice Check if user is eligible to borrow
    function isEligibleToBorrow(address user) external view returns (bool) {
        return creditProfiles[user].isEligibleForBorrowing;
    }
    
    /// @notice Get minimum credit score required
    function getMinimumCreditScore() external pure returns (uint256) {
        return MIN_CREDIT_SCORE;
    }
}