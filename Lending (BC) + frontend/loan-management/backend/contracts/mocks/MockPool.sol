// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPool {
    uint256 public totalLiquidity;
    address public interestRateModel;
    uint256 public totalBorrowedAllTime;
    uint256 public totalRepaidAllTime;

    mapping(address => uint256) public creditScores;
    mapping(address => uint256) public userDebt;
    mapping(address => mapping(address => uint256)) public userCollateral;
    mapping(address => bool) public collateralizationStatus;
    mapping(address => uint256) public collateralizationRatio;

    // Add a payable receive function to accept ETH
    receive() external payable {}

    // Add a function to forward ETH to a target address (e.g., LendingManager)
    function forwardETH(address payable to, uint256 amount) external {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "ETH transfer failed");
    }

    function setInterestRateModel(address irm) external {
        interestRateModel = irm;
    }

    function setCreditScore(address user, uint256 score) external {
        creditScores[user] = score;
    }

    function setTotalBorrowedAllTime(uint256 amount) external {
        totalBorrowedAllTime = amount;
    }

    function setTotalRepaidAllTime(uint256 amount) external {
        totalRepaidAllTime = amount;
    }

    function setUserDebt(address user, uint256 debt) external {
        userDebt[user] = debt;
    }

    function setUserCollateral(
        address user,
        address token,
        uint256 amount
    ) external {
        userCollateral[user][token] = amount;
    }

    function setCollateralizationStatus(
        address user,
        bool status,
        uint256 ratio
    ) external {
        collateralizationStatus[user] = status;
        collateralizationRatio[user] = ratio;
    }

    function debugEmitCreditScore(address user) external {
        // Mock function for compatibility
    }

    function canLend(address user) external view returns (bool) {
        return creditScores[user] >= 70;
    }

    function deposit(uint256 amount) external {
        totalLiquidity += amount;
    }

    function withdraw(uint256 amount) external {
        require(totalLiquidity >= amount, "Insufficient liquidity");
        totalLiquidity -= amount;
    }

    // --- Stubs for LendingManager compatibility ---
    function totalFunds() external view returns (uint256) {
        return totalLiquidity;
    }

    function getGlobalRiskMultiplier() external pure returns (uint256) {
        return 1e18;
    }

    // Stub for LendingManager compatibility
    function checkCollateralization(
        address
    ) external pure returns (bool, uint256) {
        return (true, 0);
    }

    // Accept ETH sent from LendingManager
    fallback() external payable {}
}
