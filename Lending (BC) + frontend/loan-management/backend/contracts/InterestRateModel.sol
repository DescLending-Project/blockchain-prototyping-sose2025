// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/AggregatorV3Interface.sol";

contract InterestRateModel {
    // --- DAO reference and permissions ---
    // bytes32 public constant SET_PARAMETERS_PERMISSION =
    //     keccak256("SET_PARAMETERS_PERMISSION");
    // bytes32 public constant SET_RISK_ADJUSTMENT_PERMISSION =
    //     keccak256("SET_RISK_ADJUSTMENT_PERMISSION");
    // bytes32 public constant SET_ORACLE_PERMISSION =
    //     keccak256("SET_ORACLE_PERMISSION");

    // --- Parameters (18 decimals) ---
    uint256 public baseRate;
    uint256 public kink;
    uint256 public slope1;
    uint256 public slope2;
    uint256 public reserveFactor;
    uint256 public maxBorrowRate;
    uint256 public maxRateChange;
    uint256 public ethPriceRiskPremium;
    uint256 public ethVolatilityThreshold;
    uint256 public lastBorrowRate;
    uint256 public lastUpdateTimestamp;
    uint256 public oracleStalenessWindow;

    // Chainlink ETH/USD oracle
    address public ethUsdOracle;
    uint256 public lastEthPrice;
    uint256 public lastEthPriceTimestamp;

    // Protocol risk adjustment (global, can be extended per-asset/user)
    int256 public protocolRiskAdjustment;

    // Events
    event ParametersUpdated();
    event OracleUpdated(address indexed newOracle);
    event RatesCapped(uint256 cappedRate);

    // --- Struct for parameters ---
    struct RateParams {
        uint256 baseRate;
        uint256 kink;
        uint256 slope1;
        uint256 slope2;
        uint256 reserveFactor;
        uint256 maxBorrowRate;
        uint256 maxRateChange;
        uint256 ethPriceRiskPremium;
        uint256 ethVolatilityThreshold;
        uint256 oracleStalenessWindow;
    }

    address public timelock;

    constructor(
        address _ethUsdOracle,
        address _timelock,
        uint256 _baseRate,
        uint256 _kink,
        uint256 _slope1,
        uint256 _slope2,
        uint256 _reserveFactor,
        uint256 _maxBorrowRate,
        uint256 _maxRateChange,
        uint256 _ethPriceRiskPremium,
        uint256 _ethVolatilityThreshold,
        uint256 _oracleStalenessWindow
    ) {
        timelock = _timelock;
        ethUsdOracle = _ethUsdOracle;
        baseRate = _baseRate;
        kink = _kink;
        slope1 = _slope1;
        slope2 = _slope2;
        reserveFactor = _reserveFactor;
        maxBorrowRate = _maxBorrowRate;
        maxRateChange = _maxRateChange;
        ethPriceRiskPremium = _ethPriceRiskPremium;
        ethVolatilityThreshold = _ethVolatilityThreshold;
        oracleStalenessWindow = _oracleStalenessWindow;
        protocolRiskAdjustment = 0;
        lastBorrowRate = _baseRate;
        lastUpdateTimestamp = block.timestamp;
    }

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelockInterestRateModel();
        _;
    }

    // --- Admin Setters ---
    function setParameters(
        uint256 _baseRate,
        uint256 _kink,
        uint256 _slope1,
        uint256 _slope2,
        uint256 _reserveFactor,
        uint256 _maxBorrowRate,
        uint256 _maxRateChange,
        uint256 _ethPriceRiskPremium,
        uint256 _ethVolatilityThreshold,
        uint256 _oracleStalenessWindow
    ) external onlyTimelock {
        baseRate = _baseRate;
        kink = _kink;
        slope1 = _slope1;
        slope2 = _slope2;
        reserveFactor = _reserveFactor;
        maxBorrowRate = _maxBorrowRate;
        maxRateChange = _maxRateChange;
        ethPriceRiskPremium = _ethPriceRiskPremium;
        ethVolatilityThreshold = _ethVolatilityThreshold;
        oracleStalenessWindow = _oracleStalenessWindow;
        emit ParametersUpdated();
    }

    function setProtocolRiskAdjustment(
        int256 adjustment
    ) external onlyTimelock {
        protocolRiskAdjustment = adjustment;
        emit ParametersUpdated();
    }

    function setOracle(address newOracle) external onlyTimelock {
        ethUsdOracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    // --- Rate Calculation ---
    function getBorrowRate(uint256 utilization) public view returns (uint256) {
        uint256 rate;
        if (utilization <= kink) {
            // Defensive: prevent division by zero
            require(kink != 0, "Division by zero in getBorrowRate: kink");
            // rate = base + slope1 * (util / kink)
            rate = baseRate + (slope1 * utilization) / kink;
        } else {
            // Defensive: prevent division by zero
            require(1e18 > kink, "Invalid kink value");
            uint256 excessUtil = utilization - kink;
            uint256 denominator = 1e18 - kink;
            require(
                denominator != 0,
                "Division by zero in getBorrowRate: denominator"
            );
            rate = baseRate + slope1 + (slope2 * excessUtil) / denominator;
        }
        // Apply protocol risk adjustment
        if (protocolRiskAdjustment > 0) {
            rate += uint256(protocolRiskAdjustment);
        } else if (protocolRiskAdjustment < 0) {
            rate -= uint256(-protocolRiskAdjustment);
        }
        // Cap at maxBorrowRate
        if (rate > maxBorrowRate) {
            rate = maxBorrowRate;
        }
        return rate;
    }

    function getSupplyRate(
        uint256 utilization,
        uint256 borrowRate
    ) public view returns (uint256) {
        // Defensive: prevent division by zero
        require(1e18 >= reserveFactor, "Invalid reserveFactor");
        uint256 oneMinusReserve = 1e18 - reserveFactor;
        // No division by zero in this formula, but check for overflow
        return (utilization * borrowRate * oneMinusReserve) / 1e36;
    }

    // Add a function to get the borrower rate for a given risk tier
    function getBorrowerRate(uint256 riskTier) external view returns (uint256) {
        // For demonstration, return baseRate + riskTier * 1e16 (1% per tier)
        return baseRate + riskTier * 1e16;
    }

    // --- Oracle Integration ---
    function getEthPrice()
        public
        view
        returns (uint256 price, uint256 updatedAt)
    {
        if (ethUsdOracle == address(0)) revert OracleNotSet();
        AggregatorV3Interface oracle = AggregatorV3Interface(ethUsdOracle);
        (, int256 answer, , uint256 updatedAt_, ) = oracle.latestRoundData();
        if (block.timestamp - updatedAt_ > oracleStalenessWindow)
            revert StaleOracle();
        return (uint256(answer), updatedAt_);
    }

    // --- View Functions ---
    function getCurrentRates(
        uint256 totalBorrowed,
        uint256 totalSupplied
    ) external view returns (uint256, uint256) {
        if (totalSupplied == 0) return (0, 0);
        // Defensive: prevent division by zero
        require(totalSupplied != 0, "Division by zero in getCurrentRates");
        uint256 utilization = (totalBorrowed * 1e18) / totalSupplied;
        uint256 borrowRate = getBorrowRate(utilization);
        uint256 supplyRate = getSupplyRate(utilization, borrowRate);
        return (borrowRate, supplyRate);
    }

    function simulateRates(
        uint256 utilization
    ) external view returns (uint256, uint256) {
        uint256 borrowRate = getBorrowRate(utilization);
        uint256 supplyRate = getSupplyRate(utilization, borrowRate);
        return (borrowRate, supplyRate);
    }

    // --- Risk/Multiplier Logic (moved from LiquidityPool) ---
    function getWeightedRiskScore(
        uint256[4] memory borrowedByTier
    ) public pure returns (uint256) {
        uint256 weightedSum = borrowedByTier[0] *
            1 +
            borrowedByTier[1] *
            2 +
            borrowedByTier[2] *
            3 +
            borrowedByTier[3] *
            4;
        uint256 validBorrowed = borrowedByTier[0] +
            borrowedByTier[1] +
            borrowedByTier[2] +
            borrowedByTier[3];
        if (validBorrowed == 0) return 0;
        return weightedSum / validBorrowed;
    }

    function getRiskMultiplier(
        uint256 weightedScore
    ) public pure returns (uint256) {
        if (weightedScore == 0) return 1e18;
        if (weightedScore <= 1) return 9e17;
        if (weightedScore <= 2) return 1e18;
        if (weightedScore <= 3) return 11e17;
        return 12e17;
    }

    function getRepaymentRatio(
        uint256 totalBorrowed,
        uint256 totalRepaid
    ) public pure returns (uint256) {
        if (totalBorrowed == 0) return 1e18;
        return (totalRepaid * 1e18) / totalBorrowed;
    }

    function getRepaymentRiskMultiplier(
        uint256 repaymentRatio
    ) public pure returns (uint256) {
        if (repaymentRatio >= 95e16) return 1e18;
        if (repaymentRatio >= 90e16) return 105e16;
        if (repaymentRatio >= 80e16) return 110e16;
        return 120e16;
    }

    function getGlobalRiskMultiplier(
        uint256 riskMult,
        uint256 repayMult
    ) public pure returns (uint256) {
        return (riskMult * repayMult) / 1e18;
    }
}

error OnlyTimelockInterestRateModel();
error StaleOracle();
error OracleNotSet();
