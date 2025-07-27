// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockLiquidityPool {
    address public timelock;
    address public admin;
    mapping(address => uint256) public creditScores;
    mapping(address => uint256) public lenderBalances;
    mapping(address => uint256) public userDebt;
    mapping(address => mapping(address => uint256)) public collateral;
    mapping(address => bool) public allowedCollateral;
    mapping(address => address) public priceFeeds;

    uint256 public totalBorrows;
    uint256 public totalSupply;
    uint256 public totalFunds;
    bool public paused;

    struct Loan {
        uint256 amount;
        uint256 timestamp;
        bool active;
    }

    mapping(address => Loan) public loans;
    mapping(address => uint256) public withdrawalRequests;
    mapping(address => uint256) public withdrawalTimestamps;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event CreditScoreUpdated(address indexed user, uint256 score);
    event Borrow(address indexed user, uint256 amount);
    event Repay(address indexed user, uint256 amount);
    event CollateralDeposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event WithdrawalRequested(address indexed user, uint256 amount);
    event WithdrawalCompleted(address indexed user, uint256 amount);
    event LiquidationExecuted(
        address indexed user,
        uint256 debtCleared,
        uint256 collateralSeized
    );

    constructor() {
        admin = msg.sender;
        timelock = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin || msg.sender == timelock, "Only admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Pausable: paused");
        _;
    }

    function setTimelock(address _timelock) external onlyAdmin {
        timelock = _timelock;
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }

    function setCreditScore(address user, uint256 score) external onlyAdmin {
        creditScores[user] = score;
        emit CreditScoreUpdated(user, score);
    }

    function updateCreditScoreFromZK(address user, uint256 score) external {
        creditScores[user] = score;
        emit CreditScoreUpdated(user, score);
    }

    function getCreditScore(address user) external view returns (uint256) {
        return creditScores[user];
    }

    function deposit() external payable whenNotPaused {
        require(msg.value > 0, "Amount must be greater than 0");
        lenderBalances[msg.sender] += msg.value;
        totalSupply += msg.value;
        totalFunds += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external whenNotPaused {
        require(lenderBalances[msg.sender] >= amount, "Insufficient balance");
        require(address(this).balance >= amount, "Insufficient pool balance");

        lenderBalances[msg.sender] -= amount;
        totalSupply -= amount;
        totalFunds -= amount;

        payable(msg.sender).transfer(amount);
        emit Withdraw(msg.sender, amount);
    }

    function requestWithdrawal(uint256 amount) external whenNotPaused {
        require(lenderBalances[msg.sender] >= amount, "Insufficient balance");
        withdrawalRequests[msg.sender] = amount;
        withdrawalTimestamps[msg.sender] = block.timestamp;
        emit WithdrawalRequested(msg.sender, amount);
    }

    function completeWithdrawal() external whenNotPaused {
        uint256 amount = withdrawalRequests[msg.sender];
        require(amount > 0, "No withdrawal request");
        require(
            block.timestamp >= withdrawalTimestamps[msg.sender] + 86400,
            "Cooldown not met"
        );
        require(address(this).balance >= amount, "Insufficient pool balance");

        withdrawalRequests[msg.sender] = 0;
        withdrawalTimestamps[msg.sender] = 0;
        lenderBalances[msg.sender] -= amount;
        totalSupply -= amount;
        totalFunds -= amount;

        payable(msg.sender).transfer(amount);
        emit WithdrawalCompleted(msg.sender, amount);
    }

    function borrow(uint256 amount) external whenNotPaused {
        require(creditScores[msg.sender] >= 50, "Credit score too low");
        require(address(this).balance >= amount, "Insufficient pool balance");
        require(amount <= totalSupply / 2, "Borrow amount too high");

        userDebt[msg.sender] += amount;
        totalBorrows += amount;
        totalFunds -= amount;

        loans[msg.sender] = Loan({
            amount: amount,
            timestamp: block.timestamp,
            active: true
        });

        payable(msg.sender).transfer(amount);
        emit Borrow(msg.sender, amount);
    }

    function repay() external payable whenNotPaused {
        require(msg.value > 0, "Amount must be greater than 0");
        require(userDebt[msg.sender] > 0, "No debt to repay");

        uint256 debt = userDebt[msg.sender];
        uint256 repayAmount = msg.value;

        if (repayAmount >= debt) {
            userDebt[msg.sender] = 0;
            totalBorrows -= debt;
            totalFunds += debt;
            loans[msg.sender].active = false;

            if (repayAmount > debt) {
                payable(msg.sender).transfer(repayAmount - debt);
            }
            emit Repay(msg.sender, debt);
        } else {
            userDebt[msg.sender] -= repayAmount;
            totalBorrows -= repayAmount;
            totalFunds += repayAmount;
            emit Repay(msg.sender, repayAmount);
        }
    }

    function setAllowedCollateral(
        address token,
        bool allowed
    ) external onlyAdmin {
        allowedCollateral[token] = allowed;
    }

    function setPriceFeed(address token, address feed) external onlyAdmin {
        priceFeeds[token] = feed;
    }

    function depositCollateral(
        address token,
        uint256 amount
    ) external whenNotPaused {
        require(allowedCollateral[token], "Token not allowed as collateral");
        collateral[msg.sender][token] += amount;
        emit CollateralDeposited(msg.sender, token, amount);
    }

    function getCollateral(
        address user,
        address token
    ) external view returns (uint256) {
        return collateral[user][token];
    }

    function checkCollateralization(
        address user
    ) external view returns (bool isHealthy, uint256 ratio) {
        uint256 debt = userDebt[user];
        if (debt == 0) return (true, type(uint256).max);

        uint256 totalCollateralValue = debt * 2;
        ratio = (totalCollateralValue * 100) / debt;
        isHealthy = ratio >= 150;
    }

    function isLiquidatable(address user) external view returns (bool) {
        (bool isHealthy, ) = this.checkCollateralization(user);
        return !isHealthy && userDebt[user] > 0;
    }

    function startLiquidation(address user) external {
        require(this.isLiquidatable(user), "User not liquidatable");
    }

    function executeLiquidation(address user) external {
        require(userDebt[user] > 0, "No debt to liquidate");

        uint256 debtAmount = userDebt[user];
        userDebt[user] = 0;
        totalBorrows -= debtAmount;
        loans[user].active = false;

        emit LiquidationExecuted(user, debtAmount, 0);
    }

    function checkUpkeep(
        bytes calldata
    ) external view returns (bool upkeepNeeded, bytes memory performData) {
        return (false, "");
    }

    function performUpkeep(bytes calldata performData) external {
        emit LiquidationExecuted(address(0), 0, 0);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getAdmin() external view returns (address) {
        return admin;
    }

    function totalBorrowedAllTime() external view returns (uint256) {
        return totalBorrows;
    }

    function totalRepaidAllTime() external view returns (uint256) {
        return totalBorrows / 2;
    }

    function interestRateModel() external view returns (address) {
        return address(this);
    }

    function getGlobalRiskMultiplier() external pure returns (uint256) {
        return 1e18;
    }

    function accrueInterest() external {
        // Mock interest accrual
    }

    function pause() external onlyAdmin {
        paused = true;
    }

    function unpause() external onlyAdmin {
        paused = false;
    }

    function emergencyWithdraw() external onlyAdmin {
        payable(admin).transfer(address(this).balance);
    }

    function emergencyTokenRecovery(
        address token,
        uint256 amount
    ) external onlyAdmin {
        // Mock token recovery
    }

    receive() external payable {
        if (!paused) {
            lenderBalances[msg.sender] += msg.value;
            totalSupply += msg.value;
            totalFunds += msg.value;
            emit Deposit(msg.sender, msg.value);
        }
    }

    fallback() external payable {
        if (!paused) {
            lenderBalances[msg.sender] += msg.value;
            totalSupply += msg.value;
            totalFunds += msg.value;
            emit Deposit(msg.sender, msg.value);
        }
    }
}
