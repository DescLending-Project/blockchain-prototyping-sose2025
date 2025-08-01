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
        return 0; // Volatile tokens use the main contract's threshold
    }

    function isTokenStablecoin(address token) external view returns (bool) {
        return isStablecoin[token];
    }
}
