// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/AggregatorV3Interface.sol";

contract InterestRateModel is Ownable {
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

    constructor(
        address _owner,
        address _ethUsdOracle,
        RateParams memory params
    ) Ownable(_owner) {
        ethUsdOracle = _ethUsdOracle;
        baseRate = params.baseRate;
        kink = params.kink;
        slope1 = params.slope1;
        slope2 = params.slope2;
        reserveFactor = params.reserveFactor;
        maxBorrowRate = params.maxBorrowRate;
        maxRateChange = params.maxRateChange;
        ethPriceRiskPremium = params.ethPriceRiskPremium;
        ethVolatilityThreshold = params.ethVolatilityThreshold;
        oracleStalenessWindow = params.oracleStalenessWindow;
        protocolRiskAdjustment = 0;
        lastBorrowRate = params.baseRate;
        lastUpdateTimestamp = block.timestamp;
    }

    // Add a new modifier for legacy revert string
    modifier onlyOwnerString() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
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
    ) external onlyOwnerString {
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
    ) external onlyOwnerString {
        protocolRiskAdjustment = adjustment;
        emit ParametersUpdated();
    }

    function setOracle(address newOracle) external onlyOwnerString {
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
        if (ethUsdOracle == address(0)) revert("Oracle not set");
        AggregatorV3Interface oracle = AggregatorV3Interface(ethUsdOracle);
        (, int256 answer, , uint256 updatedAt_, ) = oracle.latestRoundData();
        if (block.timestamp - updatedAt_ > oracleStalenessWindow)
            revert("Stale oracle");
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
}
