// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract StablecoinManager is Ownable {
    mapping(address => bool) public isStablecoin;
    mapping(address => uint256) public stablecoinLTV;
    mapping(address => uint256) public stablecoinLiquidationThreshold;

    uint256 public constant DEFAULT_STABLECOIN_LTV = 85; // 85% for stablecoins
    uint256 public constant DEFAULT_VOLATILE_LTV = 75; // 75% for volatile tokens
    uint256 public constant DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD = 110; // 110% for stablecoins
    uint256 public constant MAX_STABLECOIN_LTV = 90; // Maximum 90% LTV for stablecoins
    uint256 public constant MAX_VOLATILE_LTV = 77; // Maximum 77% LTV for volatile tokens

    event StablecoinParamsSet(
        address indexed token,
        bool isStable,
        uint256 ltv,
        uint256 liquidationThreshold
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setStablecoinParams(
        address token,
        bool isStable,
        uint256 ltv,
        uint256 newThreshold
    ) external onlyOwner {
        require(ltv <= MAX_STABLECOIN_LTV, "LTV too high"); // Max 90% LTV for stablecoins
        require(
            newThreshold >= DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD,
            "Threshold too low"
        ); // Min 110% for stablecoins

        isStablecoin[token] = isStable;
        stablecoinLTV[token] = ltv;
        stablecoinLiquidationThreshold[token] = newThreshold;

        emit StablecoinParamsSet(token, isStable, ltv, newThreshold);
    }

    function getLTV(address token) external view returns (uint256) {
        if (isStablecoin[token]) {
            return
                stablecoinLTV[token] > 0
                    ? stablecoinLTV[token]
                    : DEFAULT_STABLECOIN_LTV;
        }
        // For volatile tokens, allow per-token config or fallback to default
        if (stablecoinLTV[token] > 0) {
            return stablecoinLTV[token];
        }
        return DEFAULT_VOLATILE_LTV;
    }

    function getLiquidationThreshold(
        address token
    ) external view returns (uint256) {
        if (isStablecoin[token]) {
            return
                stablecoinLiquidationThreshold[token] > 0
                    ? stablecoinLiquidationThreshold[token]
                    : DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD;
        }
        // For volatile tokens, allow per-token config or fallback to 0
        if (stablecoinLiquidationThreshold[token] > 0) {
            return stablecoinLiquidationThreshold[token];
        }
        return 0;
    }

    function isTokenStablecoin(address token) external view returns (bool) {
        return isStablecoin[token];
    }

    // Added for test/debugging: returns (isStablecoin, LTV, liquidationThreshold)
    function getStablecoinParams(
        address token
    ) external view returns (bool, uint256, uint256) {
        return (
            isStablecoin[token],
            stablecoinLTV[token] > 0
                ? stablecoinLTV[token]
                : DEFAULT_STABLECOIN_LTV,
            stablecoinLiquidationThreshold[token] > 0
                ? stablecoinLiquidationThreshold[token]
                : DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD
        );
    }

    // Aliases for test/integration compatibility
    function setParams(
        address token,
        bool allowed,
        uint256 ltv,
        uint256 requiredRatio
    ) external onlyOwner {
        require(ltv <= MAX_STABLECOIN_LTV, "LTV too high");
        require(
            requiredRatio >= DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD,
            "Threshold too low"
        );

        isStablecoin[token] = allowed;
        stablecoinLTV[token] = ltv;
        stablecoinLiquidationThreshold[token] = requiredRatio;

        emit StablecoinParamsSet(token, allowed, ltv, requiredRatio);
    }

    function getParams(
        address token
    ) external view returns (bool, uint256, uint256) {
        return (
            isStablecoin[token],
            stablecoinLTV[token] > 0
                ? stablecoinLTV[token]
                : DEFAULT_STABLECOIN_LTV,
            stablecoinLiquidationThreshold[token] > 0
                ? stablecoinLiquidationThreshold[token]
                : DEFAULT_STABLECOIN_LIQUIDATION_THRESHOLD
        );
    }
}
