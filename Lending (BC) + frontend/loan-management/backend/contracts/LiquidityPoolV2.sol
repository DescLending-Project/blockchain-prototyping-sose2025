// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


// OwnableUpgradeable is used to manage ownership of the contract

contract LiquidityPoolV2 is Initializable, OwnableUpgradeable {
    mapping(address => mapping(address => uint256)) public collateralBalance;
    mapping(address => bool) public isAllowedCollateral;

    mapping(address => uint256) public creditScore;
    mapping(address => uint256) public userDebt;
    mapping(address => uint256) public borrowTimestamp;

    uint256 public totalFunds;

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    // to determine which tokens are allowed as collateral, a simple mapping

    function setAllowedCollateral(address token, bool allowed) external onlyOwner {
        isAllowedCollateral[token] = allowed;
        emit CollateralTokenStatusChanged(token, allowed);
    }

    function depositCollateral(address token, uint256 amount) external {
        require(isAllowedCollateral[token], "Token not allowed");
        require(amount > 0, "Amount must be > 0");

       IERC20(token).transferFrom(msg.sender, address(this), amount);


        collateralBalance[token][msg.sender] += amount;
        emit CollateralDeposited(msg.sender, token, amount);
    }

    function withdrawCollateral(address token, uint256 amount) external {
        require(isAllowedCollateral[token], "Token not allowed");
        require(collateralBalance[token][msg.sender] >= amount, "Insufficient balance");

        collateralBalance[token][msg.sender] -= amount;

        bool success = IERC20(token).transfer(msg.sender, amount);
        require(success, "Withdraw failed");

        emit CollateralWithdrawn(msg.sender, token, amount);
    }

    function getCollateral(address user, address token) external view returns (uint256) {
        return collateralBalance[token][user];
    }

    function getMyDebt() external view returns (uint) {
        return userDebt[msg.sender];
    }

   // functions we had before

    receive() external payable {
        totalFunds += msg.value;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function borrow(uint256 amount) external {
        require(amount <= address(this).balance, "Insufficient pool liquidity");
        require(userDebt[msg.sender] == 0, "Repay your existing debt first");

        userDebt[msg.sender] = amount;
        borrowTimestamp[msg.sender] = block.timestamp;

        payable(msg.sender).transfer(amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay() external payable {
        require(userDebt[msg.sender] > 0, "No active debt");
        require(msg.value >= userDebt[msg.sender], "Repayment too low");

        totalFunds += msg.value;
        emit Repaid(msg.sender, msg.value);

        userDebt[msg.sender] = 0;
        borrowTimestamp[msg.sender] = 0;
    }

    function extract(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient contract balance");

        totalFunds -= amount;
        payable(owner()).transfer(amount);

        emit Extracted(owner(), amount);
    }

    function setCreditScore(address user, uint256 score) external onlyOwner {
        require(score <= 100, "Score out of range");
        creditScore[user] = score;
        emit CreditScoreAssigned(user, score);
    }

    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 amount);
    event CollateralTokenStatusChanged(address indexed token, bool isAllowed);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Extracted(address indexed owner, uint256 amount);
    event CreditScoreAssigned(address indexed user, uint256 score);
}
