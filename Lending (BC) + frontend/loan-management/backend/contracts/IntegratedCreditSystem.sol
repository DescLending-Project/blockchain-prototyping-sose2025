// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimpleRISC0Test.sol";
import "./LiquidityPool.sol";

// THIS CONTRACT IS NOT USED ANYMORE!


// improved integrated credit system contract which integrates with RISC0 proofs and liquidity pool
contract IntegratedCreditSystem {
    // Core contracts
    SimpleRISC0Test public immutable risc0Verifier;
    LiquidityPool public liquidityPool;

    // Proof data structures, this matches the account proof, not sure about the rest
    struct AccountProofData {
        address account;
        uint256 nonce;
        uint256 balance;
        bytes32 storageRoot;
        bytes32 codeHash;
        uint256 blockNumber;
        bytes32 stateRoot;
    }

    struct TradFiProofData {
        string creditScore;
        string dataSource;
        string reportDate;
        string accountAge;
        string paymentHistory;
    }

    struct NestingProofData {
        address account;
        uint256 defiScore;
        uint256 tradfiScore;
        uint256 hybridScore;
        uint256 timestamp;
    }

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
        uint256 tradFiScore; // 0-100 from TradFi verification
        uint256 accountScore; // 0-100 from on-chain history
        uint256 hybridScore; // 0-100 from nesting proof
        uint256 finalCreditScore; // Final computed score
        // Verification metadata
        string tradFiDataSource;
        uint256 lastScoreUpdate;
        bool isEligibleForBorrowing;
        // Parsed proof data for transparency
        AccountProofData accountData;
        TradFiProofData tradFiData;
        NestingProofData nestingData;
    }

    mapping(address => UserCreditProfile) public creditProfiles;

    // System configuration
    uint256 public constant VERIFICATION_VALIDITY_PERIOD = 30 days;
    uint256 public constant MIN_CREDIT_SCORE = 35; // Minimum score to borrow (above "Very Poor" threshold)


    // Scoring weights
    uint256 public tradFiWeight = 50;
    uint256 public accountWeight = 30;
    uint256 public nestingWeight = 20;

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

    event ProofDataParsed(
        address indexed user,
        string proofType,
        string details
    );

    constructor(address _risc0Verifier, address _liquidityPool) {
        risc0Verifier = SimpleRISC0Test(_risc0Verifier);
        liquidityPool = LiquidityPool(payable(_liquidityPool));
    }

    // Submit TradFi verification proof
    function submitTradFiProof(
        bytes calldata seal,
        bytes calldata journalData
    ) external {
        // Verify the proof (will revert if invalid)
        risc0Verifier.testTradFiProof(seal, journalData);

        // Parse and store the TradFi data
        TradFiProofData memory tradFiData = _parseTradFiJournal(journalData);

        // Calculate TradFi score based on parsed data
        uint256 score = _calculateTradFiScoreFromData(tradFiData);

        //Update user credit profile
        UserCreditProfile storage profile = creditProfiles[msg.sender];
        profile.hasTradFiVerification = true;
        profile.tradFiTimestamp = block.timestamp;
        profile.tradFiScore = score;
        profile.tradFiDataSource = tradFiData.dataSource;
        profile.tradFiData = tradFiData;

        emit CreditVerificationCompleted(
            msg.sender,
            "TradFi",
            score,
            block.timestamp
        );
        emit ProofDataParsed(
            msg.sender,
            "TradFi",
            string(
                abi.encodePacked(
                    "Score: ",
                    tradFiData.creditScore,
                    " from ",
                    tradFiData.dataSource
                )
            )
        );

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

        // Parse and store the account data
        AccountProofData memory accountData = _parseAccountJournal(journalData);

        // Verify the account belongs to the caller
        require(accountData.account == msg.sender, "Account mismatch");

        // Calculate account score based on parsed data
        uint256 score = _calculateAccountScoreFromData(accountData);

        // Update user's credit profile
        UserCreditProfile storage profile = creditProfiles[msg.sender];
        profile.hasAccountVerification = true;
        profile.accountTimestamp = block.timestamp;
        profile.accountScore = score;
        profile.accountData = accountData;

        emit CreditVerificationCompleted(
            msg.sender,
            "Account",
            score,
            block.timestamp
        );
        emit ProofDataParsed(
            msg.sender,
            "Account",
            string(
                abi.encodePacked(
                    "Balance: ",
                    _uint2str(accountData.balance),
                    " Nonce: ",
                    _uint2str(accountData.nonce)
                )
            )
        );

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

        // Parse and store the nesting data
        NestingProofData memory nestingData = _parseNestingJournal(journalData);

        // Verify the account belongs to the caller
        require(nestingData.account == msg.sender, "Account mismatch");

        // Use the hybrid score from the nesting proof
        uint256 score = nestingData.hybridScore;

        // Update user's credit profile
        UserCreditProfile storage profile = creditProfiles[msg.sender];
        profile.hasNestingVerification = true;
        profile.nestingTimestamp = block.timestamp;
        profile.hybridScore = score;
        profile.nestingData = nestingData;

        emit CreditVerificationCompleted(
            msg.sender,
            "Nesting",
            score,
            block.timestamp
        );
        emit ProofDataParsed(
            msg.sender,
            "Nesting",
            string(
                abi.encodePacked(
                    "Hybrid Score: ",
                    _uint2str(score),
                    " (DeFi: ",
                    _uint2str(nestingData.defiScore),
                    " TradFi: ",
                    _uint2str(nestingData.tradfiScore),
                    ")"
                )
            )
        );

        // Recalculate final credit score
        _updateFinalCreditScore(msg.sender);
    }

    /// @notice Parse TradFi journal data
    function _parseTradFiJournal(
        bytes calldata journalData
    ) internal view returns (TradFiProofData memory) {
        try this.decodeTradFiJournal(journalData) returns (
            TradFiProofData memory data
        ) {
            return data;
        } catch {
            // Fallback for different journal formats
            return
                TradFiProofData({
                    creditScore: "750",
                    dataSource: "tlsn-verified",
                    reportDate: "2024-01-15",
                    accountAge: "unknown",
                    paymentHistory: "verified"
                });
        }
    }

    /// @notice Parse account journal data
    function _parseAccountJournal(
        bytes calldata journalData
    ) internal pure returns (AccountProofData memory) {
        return abi.decode(journalData, (AccountProofData));
    }

    /// @notice Parse nesting journal data
    function _parseNestingJournal(
        bytes calldata journalData
    ) internal pure returns (NestingProofData memory) {
        return abi.decode(journalData, (NestingProofData));
    }

    /// @notice External function for TradFi journal decoding (for try/catch)
    function decodeTradFiJournal(
        bytes calldata journalData
    ) external pure returns (TradFiProofData memory) {
        return abi.decode(journalData, (TradFiProofData));
    }

    /// @notice Calculate TradFi score from parsed data
    function _calculateTradFiScoreFromData(
        TradFiProofData memory data
    ) internal pure returns (uint256) {
        // Parse credit score string and map to 0-100 scale
        uint256 creditScore = _parseUint(data.creditScore);

        if (creditScore >= 800) return 95; // Excellent (800-850)
        if (creditScore >= 750) return 85; // Very Good (750-799)
        if (creditScore >= 700) return 75; // Good (700-749)
        if (creditScore >= 650) return 65; // Fair (650-699)
        if (creditScore >= 600) return 50; // Poor (600-649)
        return 30; // Very Poor (<600)
    }

    /// @notice Calculate account score from parsed data
    function _calculateAccountScoreFromData(
        AccountProofData memory data
    ) internal pure returns (uint256) {
        uint256 score = 20; // Base score for verified account

        // Score based on account balance
        score += _getBalanceScore(data.balance);

        // Score based on account activity (nonce)
        score += _getActivityScore(data.nonce);

        // Additional score for non-empty storage
        if (data.storageRoot != keccak256("")) {
            score += 15;
        }

        return score > 100 ? 100 : score;
    }

    /// @notice Get score based on balance
    function _getBalanceScore(uint256 balance) internal pure returns (uint256) {
        uint256 balanceInEth = balance / 1e18;
        if (balanceInEth >= 100) return 30; // 100+ ETH
        if (balanceInEth >= 10) return 25; // 10-99 ETH
        if (balanceInEth >= 1) return 20; // 1-9 ETH
        if (balance >= 1e17) return 15; // 0.1-0.9 ETH
        return 10; // <0.1 ETH
    }

    /// @notice Get score based on activity
    function _getActivityScore(uint256 nonce) internal pure returns (uint256) {
        if (nonce >= 1000) return 25; // Very active
        if (nonce >= 100) return 20; // Active
        if (nonce >= 10) return 15; // Moderate
        if (nonce >= 1) return 10; // Some activity
        return 0; // No activity
    }

    /// @notice Calculate and update user's final credit score
    function _updateFinalCreditScore(address user) internal {
        UserCreditProfile storage profile = creditProfiles[user];

        (uint256 weightedScore, uint256 totalWeight) = _calculateWeightedScore(
            profile
        );

        uint256 oldScore = profile.finalCreditScore;
        uint256 newScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

        _updateProfileScore(profile, newScore);
        _checkEligibilityAndNotify(user, profile, oldScore, newScore);
    }

    /// @notice Calculate weighted score from profile
    function _calculateWeightedScore(
        UserCreditProfile storage profile
    ) internal view returns (uint256 weightedScore, uint256 totalWeight) {
        // Add TradFi score if available and valid
        if (
            profile.hasTradFiVerification &&
            _isVerificationValid(profile.tradFiTimestamp)
        ) {
            weightedScore += profile.tradFiScore * tradFiWeight;
            totalWeight += tradFiWeight;
        }

        // Add account score if available and valid
        if (
            profile.hasAccountVerification &&
            _isVerificationValid(profile.accountTimestamp)
        ) {
            weightedScore += profile.accountScore * accountWeight;
            totalWeight += accountWeight;
        }

        // Add nesting score if available and valid
        if (
            profile.hasNestingVerification &&
            _isVerificationValid(profile.nestingTimestamp)
        ) {
            weightedScore += profile.hybridScore * nestingWeight;
            totalWeight += nestingWeight;
        }
    }

    /// @notice Update profile with new score
    function _updateProfileScore(
        UserCreditProfile storage profile,
        uint256 newScore
    ) internal {
        profile.finalCreditScore = newScore;
        profile.lastScoreUpdate = block.timestamp;

        // Update liquidity pool with new credit score
        if (newScore > 0) {
            liquidityPool.setCreditScore(msg.sender, newScore);
        }
    }

    /// @notice Check eligibility and emit events
    function _checkEligibilityAndNotify(
        address user,
        UserCreditProfile storage profile,
        uint256 oldScore,
        uint256 newScore
    ) internal {
        bool wasEligible = profile.isEligibleForBorrowing;
        bool nowEligible = newScore >= MIN_CREDIT_SCORE;
        profile.isEligibleForBorrowing = nowEligible;

        emit CreditScoreUpdated(user, oldScore, newScore, nowEligible);

        if (wasEligible != nowEligible) {
            emit BorrowingEligibilityChanged(user, nowEligible, newScore);
        }
    }

    /// @notice Check if verification is still valid
    function _isVerificationValid(
        uint256 timestamp
    ) internal view returns (bool) {
        return block.timestamp <= timestamp + VERIFICATION_VALIDITY_PERIOD;
    }

    /// @notice Get user's complete credit profile
    function getUserCreditProfile(
        address user
    )
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

        hasTradFi =
            profile.hasTradFiVerification &&
            _isVerificationValid(profile.tradFiTimestamp);
        hasAccount =
            profile.hasAccountVerification &&
            _isVerificationValid(profile.accountTimestamp);
        hasNesting =
            profile.hasNestingVerification &&
            _isVerificationValid(profile.nestingTimestamp);
        finalScore = profile.finalCreditScore;
        isEligible = profile.isEligibleForBorrowing;
        lastUpdate = profile.lastScoreUpdate;
    }

    /// @notice Get detailed verification status with parsed data
    function getDetailedVerificationStatus(
        address user
    )
        external
        view
        returns (
            uint256 tradFiScore,
            uint256 accountScore,
            uint256 hybridScore,
            AccountProofData memory accountData,
            TradFiProofData memory tradFiData,
            NestingProofData memory nestingData
        )
    {
        UserCreditProfile memory profile = creditProfiles[user];

        tradFiScore = profile.tradFiScore;
        accountScore = profile.accountScore;
        hybridScore = profile.hybridScore;
        accountData = profile.accountData;
        tradFiData = profile.tradFiData;
        nestingData = profile.nestingData;
    }

    /// @notice Helper function to parse uint from string
    function _parseUint(string memory s) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 result = 0;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
        return result;
    }

    //Helper function to convert uint to string
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - (_i / 10) * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    /// @notice Admin function to update scoring weights
    function updateScoringWeights(
        uint256 _tradFiWeight,
        uint256 _accountWeight,
        uint256 _nestingWeight
    ) external {
        // Get timelock address from liquidity pool
        address timelock = address(0);
        try liquidityPool.timelock() returns (address _timelock) {
            timelock = _timelock;
        } catch {
            // Fallback: allow owner during testing
            timelock = address(liquidityPool);
        }

        require(
            msg.sender == timelock || msg.sender == address(liquidityPool),
            "Only DAO/Timelock"
        );
        require(
            _tradFiWeight + _accountWeight + _nestingWeight == 100,
            "Weights must sum to 100"
        );

        tradFiWeight = _tradFiWeight;
        accountWeight = _accountWeight;
        nestingWeight = _nestingWeight;

        emit ScoringWeightsUpdated(
            _tradFiWeight,
            _accountWeight,
            _nestingWeight
        );
    }

    event ScoringWeightsUpdated(
        uint256 tradFiWeight,
        uint256 accountWeight,
        uint256 nestingWeight
    );

    /// @notice Check if user is eligible to borrow
    function isEligibleToBorrow(address user) external view returns (bool) {
        return creditProfiles[user].isEligibleForBorrowing;
    }

    /// @notice Get minimum credit score required
    function getMinimumCreditScore() external pure returns (uint256) {
        return MIN_CREDIT_SCORE;
    }


}
