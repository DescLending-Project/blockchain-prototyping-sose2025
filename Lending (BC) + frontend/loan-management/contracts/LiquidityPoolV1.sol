// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract LiquidityPoolV1 is Initializable {
    address public owner;
    uint public totalFunds;
    bool public locked;

    mapping(address => uint) public userDebt;
    mapping(address => uint8) public creditScore;
    mapping(address => uint) public borrowTimestamp;

    event Borrowed(address indexed borrower, uint amount, uint timestamp);
    event Repaid(address indexed payer, uint amount, uint timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier noReentrancy() {
        require(!locked, "No reentrancy");
        locked = true;
        _;
        locked = false;
    }

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Invalid address: zero address");
        require(_addr != address(this), "Invalid address: self");
        _;
    }

    function initialize(address _owner) public initializer {
        owner = _owner;
    }

    receive() external payable {
        totalFunds += msg.value;
    }

    function extract(uint amount) external onlyOwner noReentrancy {
        require(amount <= address(this).balance, "Insufficient balance");
        totalFunds -= amount;
        payable(owner).transfer(amount);
    }

    function getBalance() external view returns (uint) {
        return address(this).balance;
    }

    function borrow(uint amount) external noReentrancy {
        require(amount > 0, "Amount must be greater than 0");
        require(creditScore[msg.sender] >= 60, "Credit score too low");
        require(amount <= totalFunds / 2, "Insufficient funds in the pool");

        userDebt[msg.sender] += amount;
        totalFunds -= amount;
        borrowTimestamp[msg.sender] = block.timestamp;
        payable(msg.sender).transfer(amount);

        emit Borrowed(msg.sender, amount, block.timestamp);
    }

    function repay() external payable {
        require(userDebt[msg.sender] > 0, "No outstanding debt");
        require(msg.value > 0, "Must send ETH to repay");

        uint repayAmount = msg.value > userDebt[msg.sender]
            ? userDebt[msg.sender]
            : msg.value;

        userDebt[msg.sender] -= repayAmount;
        totalFunds += repayAmount;

        emit Repaid(msg.sender, repayAmount, block.timestamp);
    }

    function getMyDebt() external view returns (uint) {
        return userDebt[msg.sender];
    }

    function setCreditScore(
        address user,
        uint8 score
    ) external onlyOwner validAddress(user) {
        require(score <= 100, "Invalid credit score");
        creditScore[user] = score;
    }

    function transferOwnership(
        address newOwner
    ) external onlyOwner validAddress(newOwner) {
        owner = newOwner;
    }
}
