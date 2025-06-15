// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract LiquidityPoolV3 is
    Initializable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    AutomationCompatibleInterface
{
    mapping(address => mapping(address => uint256)) public collateralBalance;
    mapping(address => bool) public isAllowedCollateral;
    mapping(address => uint256) public creditScore;
    mapping(address => uint256) public userDebt;
    mapping(address => uint256) public borrowTimestamp;
    mapping(address => bool) public isLiquidatable;
    mapping(address => uint256) public liquidationStartTime;
    mapping(address => uint256) public liquidationThreshold;
    mapping(address => address) public priceFeed;

    address[] public collateralTokenList;

    uint256 public constant GRACE_PERIOD = 3 days;
    uint256 public constant DEFAULT_LIQUIDATION_THRESHOLD = 130;
    uint256 public constant LIQUIDATION_PENALTY = 5;

    uint256 public totalFunds;
    bool public locked;
    bool public paused;

    address public liquidator;

    // New state variables for limits and parameters
    uint256 public maxBorrowAmount;
    uint256 public maxCollateralAmount;
    uint256 public maxLiquidationBonus;
    uint256 public maxLiquidationPenalty;
    uint256 public maxLiquidationThreshold;
    uint256 public maxLiquidationTime;
    uint256 public maxLiquidationAmount;
    uint256 public maxLiquidationRatio;
    uint256 public maxLiquidationDelay;
    uint256 public maxLiquidationGracePeriod;
    uint256 public interestRate;

    // Lender interest state
    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant WITHDRAWAL_COOLDOWN = 1 days; // Cooldown period between withdrawals
    uint256 public EARLY_WITHDRAWAL_PENALTY; // Percentage (e.g., 5 for 5%)

    uint256 public constant MIN_DEPOSIT_AMOUNT = 0.01 ether; // Minimum 0.01 ETH deposit
    uint256 public constant MAX_DEPOSIT_AMOUNT = 100 ether; // Maximum 100 ETH per user

    struct LenderInfo {
        uint256 balance; // Principal balance
        uint256 depositTimestamp;
        uint256 lastInterestUpdate;
        uint256 interestIndex;
        uint256 earnedInterest; // Accumulated interest
        uint256 pendingPrincipalWithdrawal; // Renamed from pendingWithdrawal
        uint256 withdrawalRequestTime;
        uint256 lastInterestDistribution;
        uint256 lastWithdrawalTime;
    }

    mapping(address => LenderInfo) public lenders;
    uint256 public totalLent;
    uint256 public currentDailyRate;
    uint256 public lastRateUpdateDay;
    mapping(uint256 => uint256) public dailyInterestRate;

    struct InterestTier {
        uint256 minAmount;
        uint256 rate;
    }

    InterestTier[] public interestTiers;

    // added variables
    address[] public users;
    mapping(address => bool) public isKnownUser;

    event CollateralDeposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event CollateralWithdrawn(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event CollateralTokenStatusChanged(address indexed token, bool isAllowed);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Extracted(address indexed owner, uint256 amount);
    event EmergencyPaused(bool isPaused);
    event CreditScoreAssigned(address indexed user, uint256 score);
    event LiquidationStarted(address indexed user);
    event LiquidationExecuted(
        address indexed user,
        address indexed liquidator,
        uint256 amount
    );
    event GracePeriodExtended(address indexed user, uint256 newDeadline);
    event UserError(address indexed user, string message);
    // New lending events
    event FundsDeposited(address indexed lender, uint256 amount);
    event InterestCredited(address indexed lender, uint256 interest);
    event FundsWithdrawn(
        address indexed lender,
        uint256 amount,
        uint256 penalty
    );
    event EarlyWithdrawalPenalty(address indexed lender, uint256 penaltyAmount);
    event WithdrawalRequested(
        address indexed lender,
        uint256 amount,
        uint256 unlockTime
    );
    event InterestClaimed(address indexed lender, uint256 interest);
    event InterestAvailable(address indexed lender, uint256 amount);
    event PrincipalWithdrawalRequested(
        address indexed lender,
        uint256 amount,
        uint256 unlockTime
    );
    event WithdrawalCancelled(address indexed lender, uint256 amount);

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

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __AccessControl_init();
        _setRoleAdmin(DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);

        // Initialize default values for new parameters
        maxBorrowAmount = type(uint256).max;
        maxCollateralAmount = type(uint256).max;
        maxLiquidationBonus = 20; // 20%
        maxLiquidationPenalty = 10; // 10%
        maxLiquidationThreshold = 150; // 150%
        maxLiquidationTime = 7 days;
        maxLiquidationAmount = type(uint256).max;
        maxLiquidationRatio = 150; // 150%
        maxLiquidationDelay = 2 days;
        maxLiquidationGracePeriod = 3 days;
        interestRate = 5; // 5%

        // Initialize lending parameters
        currentDailyRate = 1.0001304e18; // ~5% APY daily rate
        lastRateUpdateDay = block.timestamp / SECONDS_PER_DAY;
        EARLY_WITHDRAWAL_PENALTY = 5; // 5% penalty

        // Initialize interest tiers
        interestTiers.push(InterestTier(10 ether, 1.0001500e18)); // 10+ ETH: 5.5% APY
        interestTiers.push(InterestTier(5 ether, 1.0001400e18)); // 5+ ETH: 5.2% APY
        interestTiers.push(InterestTier(1 ether, 1.0001304e18)); // 1+ ETH: 5% APY
    }

    // Chainlink Automation functions

    function getAllUsers() public view returns (address[] memory) {
        return users;
    }

    function checkUpkeep(
        bytes calldata
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        address[] memory candidates = getAllUsers();
        address[] memory toLiquidate = new address[](candidates.length);
        uint count = 0;

        for (uint i = 0; i < candidates.length; i++) {
            address user = candidates[i];
            if (isLiquidatable[user]) {
                uint256 deadline = liquidationStartTime[user] +
                    maxLiquidationGracePeriod;
                if (block.timestamp >= deadline) {
                    toLiquidate[count] = user;
                    count++;
                }
            }
        }

        uint256 nextUpdate = _nextDistributionTime();
        bool needsInterestUpdate = block.timestamp >= nextUpdate;

        if (count > 0 || needsInterestUpdate) {
            address[] memory result = new address[](count);
            for (uint j = 0; j < count; j++) {
                result[j] = toLiquidate[j];
            }
            upkeepNeeded = true;
            performData = abi.encode(result, nextUpdate);
        } else {
            upkeepNeeded = false;
        }
    }

    function performUpkeep(bytes calldata performData) external override {
        (address[] memory liquidatableUsers, uint256 nextUpdate) = abi.decode(
            performData,
            (address[], uint256)
        );

        // Handle liquidations
        for (uint i = 0; i < liquidatableUsers.length; i++) {
            address user = liquidatableUsers[i];
            if (isLiquidatable[user]) {
                uint256 deadline = liquidationStartTime[user] +
                    maxLiquidationGracePeriod;
                if (block.timestamp >= deadline) {
                    executeLiquidation(user);
                }
            }
        }

        // Handle interest updates
        if (block.timestamp >= nextUpdate) {
            _updateGlobalInterest();
        }
    }

    // Admin functions
    function setAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        _transferOwnership(newAdmin);
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function getAdmin() external view returns (address) {
        return owner();
    }

    // Interest rate functions
    function setInterestRate(uint256 newRate) external onlyOwner {
        require(newRate <= 100, "Interest rate too high"); // Max 100%
        interestRate = newRate;
    }

    function getInterestRate() external view returns (uint256) {
        return interestRate;
    }

    // Max borrow amount functions
    function setMaxBorrowAmount(uint256 newMax) external onlyOwner {
        maxBorrowAmount = newMax;
    }

    function getMaxBorrowAmount() external view returns (uint256) {
        return maxBorrowAmount;
    }

    // Max collateral amount functions
    function setMaxCollateralAmount(uint256 newMax) external onlyOwner {
        maxCollateralAmount = newMax;
    }

    function getMaxCollateralAmount() external view returns (uint256) {
        return maxCollateralAmount;
    }

    // Liquidation parameters functions
    function setMaxLiquidationBonus(uint256 newBonus) external onlyOwner {
        require(newBonus <= 100, "Bonus too high"); // Max 100%
        maxLiquidationBonus = newBonus;
    }

    function getMaxLiquidationBonus() external view returns (uint256) {
        return maxLiquidationBonus;
    }

    function setMaxLiquidationPenalty(uint256 newPenalty) external onlyOwner {
        require(newPenalty <= 100, "Penalty too high"); // Max 100%
        maxLiquidationPenalty = newPenalty;
    }

    function getMaxLiquidationPenalty() external view returns (uint256) {
        return maxLiquidationPenalty;
    }

    function setMaxLiquidationThreshold(
        uint256 newThreshold
    ) external onlyOwner {
        require(newThreshold >= 100, "Threshold too low"); // Min 100%
        maxLiquidationThreshold = newThreshold;
    }

    function getMaxLiquidationThreshold() external view returns (uint256) {
        return maxLiquidationThreshold;
    }

    function setMaxLiquidationTime(uint256 newTime) external onlyOwner {
        maxLiquidationTime = newTime;
    }

    function getMaxLiquidationTime() external view returns (uint256) {
        return maxLiquidationTime;
    }

    function setMaxLiquidationAmount(uint256 newAmount) external onlyOwner {
        maxLiquidationAmount = newAmount;
    }

    function getMaxLiquidationAmount() external view returns (uint256) {
        return maxLiquidationAmount;
    }

    function setMaxLiquidationRatio(uint256 newRatio) external onlyOwner {
        require(newRatio >= 100, "Ratio too low"); // Min 100%
        maxLiquidationRatio = newRatio;
    }

    function getMaxLiquidationRatio() external view returns (uint256) {
        return maxLiquidationRatio;
    }

    function setMaxLiquidationDelay(uint256 newDelay) external onlyOwner {
        maxLiquidationDelay = newDelay;
    }

    function getMaxLiquidationDelay() external view returns (uint256) {
        return maxLiquidationDelay;
    }

    function setMaxLiquidationGracePeriod(
        uint256 newPeriod
    ) external onlyOwner {
        maxLiquidationGracePeriod = newPeriod;
    }

    function getMaxLiquidationGracePeriod() external view returns (uint256) {
        return maxLiquidationGracePeriod;
    }

    function setAllowedCollateral(
        address token,
        bool allowed
    ) external onlyOwner {
        isAllowedCollateral[token] = allowed;

        bool alreadyExists = false;
        for (uint i = 0; i < collateralTokenList.length; i++) {
            if (collateralTokenList[i] == token) {
                alreadyExists = true;
                break;
            }
        }

        if (allowed && !alreadyExists) {
            collateralTokenList.push(token);
        }

        emit CollateralTokenStatusChanged(token, allowed);
    }

    function depositCollateral(address token, uint256 amount) external {
        if (!isAllowedCollateral[token]) {
            emit UserError(msg.sender, "Token not allowed");
            revert("Token not allowed");
        }
        if (amount == 0) {
            emit UserError(msg.sender, "Amount must be > 0");
            revert("Amount must be > 0");
        }
        if (isLiquidatable[msg.sender]) {
            emit UserError(msg.sender, "Account is in liquidation");
            revert("Account is in liquidation");
        }

        if (!isKnownUser[msg.sender]) {
            isKnownUser[msg.sender] = true;
            users.push(msg.sender);
        }

        IERC20(token).transferFrom(msg.sender, address(this), amount);
        collateralBalance[token][msg.sender] += amount;

        emit CollateralDeposited(msg.sender, token, amount);
    }

    function withdrawCollateral(address token, uint256 amount) external {
        if (!isAllowedCollateral[token]) {
            emit UserError(msg.sender, "Token not allowed");
            revert("Token not allowed");
        }
        if (collateralBalance[token][msg.sender] < amount) {
            emit UserError(msg.sender, "Insufficient balance");
            revert("Insufficient balance");
        }
        if (isLiquidatable[msg.sender]) {
            emit UserError(msg.sender, "Account is in liquidation");
            revert("Account is in liquidation");
        }

        uint256 newCollateralValue = getTotalCollateralValue(msg.sender) -
            ((amount * getTokenValue(token)) / 1e18);

        if (
            newCollateralValue * 100 <
            userDebt[msg.sender] * getLiquidationThreshold(token)
        ) {
            emit UserError(
                msg.sender,
                "Withdrawal would make position undercollateralized"
            );
            revert("Withdrawal would make position undercollateralized");
        }

        collateralBalance[token][msg.sender] -= amount;
        IERC20(token).transfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, token, amount);
    }

    function getCollateral(
        address user,
        address token
    ) external view returns (uint256) {
        return collateralBalance[token][user];
    }

    function getMyDebt() external view returns (uint256) {
        return userDebt[msg.sender];
    }

    function borrow(uint256 amount) external whenNotPaused noReentrancy {
        if (amount == 0) {
            emit UserError(msg.sender, "Amount must be greater than 0");
            revert("Amount must be greater than 0");
        }
        if (creditScore[msg.sender] < 60) {
            emit UserError(msg.sender, "Credit score too low");
            revert("Credit score too low");
        }
        if (amount > totalFunds / 2) {
            emit UserError(
                msg.sender,
                "Borrow amount exceeds available lending capacity"
            );
            revert("Borrow amount exceeds available lending capacity");
        }
        if (amount > maxBorrowAmount) {
            emit UserError(msg.sender, "Exceeds max borrow amount");
            revert("Exceeds max borrow amount");
        }
        if (userDebt[msg.sender] != 0) {
            emit UserError(msg.sender, "Repay your existing debt first");
            revert("Repay your existing debt first");
        }

        if (!isKnownUser[msg.sender]) {
            isKnownUser[msg.sender] = true;
            users.push(msg.sender);
        }

        uint256 collateralValue = getTotalCollateralValue(msg.sender);
        if (collateralValue > maxCollateralAmount) {
            emit UserError(msg.sender, "Exceeds max collateral amount");
            revert("Exceeds max collateral amount");
        }

        if (collateralValue * 100 < amount * DEFAULT_LIQUIDATION_THRESHOLD) {
            emit UserError(msg.sender, "Insufficient collateral for this loan");
            revert("Insufficient collateral for this loan");
        }

        userDebt[msg.sender] += amount;
        totalLent -= amount;
        totalFunds -= amount;
        borrowTimestamp[msg.sender] = block.timestamp;

        payable(msg.sender).transfer(amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay() external payable whenNotPaused {
        if (userDebt[msg.sender] == 0) {
            emit UserError(msg.sender, "No outstanding debt");
            revert("No outstanding debt");
        }
        if (msg.value == 0) {
            emit UserError(msg.sender, "Must send funds to repay");
            revert("Must send funds to repay");
        }

        uint256 interestOwed = calculateInterest(msg.sender);
        uint256 totalOwed = userDebt[msg.sender] + interestOwed;

        if (msg.value > totalOwed) {
            emit UserError(msg.sender, "Repayment exceeds total debt");
            revert("Repayment exceeds total debt");
        }

        _updateGlobalInterest();

        // First apply payment to interest
        uint256 remainingPayment = msg.value;
        if (interestOwed > 0) {
            uint256 interestPayment = remainingPayment > interestOwed
                ? interestOwed
                : remainingPayment;
            totalLent += interestPayment; // Interest becomes available to lend again
            remainingPayment -= interestPayment;
        }

        // Then apply remaining payment to principal
        if (remainingPayment > 0) {
            userDebt[msg.sender] -= remainingPayment;
            totalLent += remainingPayment; // Principal becomes available to lend again
        }

        totalFunds += msg.value;

        // Only reset borrow timestamp if fully repaid
        if (userDebt[msg.sender] == 0) {
            borrowTimestamp[msg.sender] = 0;
        }

        if (isLiquidatable[msg.sender]) {
            isLiquidatable[msg.sender] = false;
            liquidationStartTime[msg.sender] = 0;
        }
        emit Repaid(msg.sender, msg.value);
    }

    function extract(uint256 amount) external onlyOwner noReentrancy {
        require(
            amount <= address(this).balance,
            "Insufficient contract balance"
        );

        totalFunds -= amount;
        payable(owner()).transfer(amount);

        emit Extracted(owner(), amount);
    }

    function setCreditScore(
        address user,
        uint256 score
    ) external onlyOwner validAddress(user) {
        require(score <= 100, "Score out of range");
        creditScore[user] = score;
        emit CreditScoreAssigned(user, score);
    }

    function getCreditScore(address user) external view returns (uint256) {
        return creditScore[user];
    }

    function setPriceFeed(address token, address feed) external onlyOwner {
        require(isAllowedCollateral[token], "Token not allowed as collateral");
        priceFeed[token] = feed;
    }

    function getPriceFeed(address token) public view returns (address) {
        require(isAllowedCollateral[token], "Token not allowed as collateral");
        return priceFeed[token];
    }

    function setLiquidationThreshold(
        address token,
        uint256 threshold
    ) external onlyOwner {
        require(isAllowedCollateral[token], "Token not allowed as collateral");
        require(threshold <= maxLiquidationThreshold, "Exceeds max threshold");
        require(threshold > 100, "Threshold must be > 100%");
        liquidationThreshold[token] = threshold;
    }

    function checkCollateralization(
        address user
    ) public view returns (bool isHealthy, uint256 ratio) {
        uint256 totalCollateralValue = getTotalCollateralValue(user);
        uint256 debt = userDebt[user];

        if (debt == 0) {
            return (true, type(uint256).max);
        }

        // Calculate ratio with safety checks
        if (totalCollateralValue == 0) {
            return (false, 0);
        }

        ratio = (totalCollateralValue * 100) / debt;
        isHealthy = ratio >= getMinCollateralRatio();
        return (isHealthy, ratio);
    }

    function startLiquidation(address user) external {
        (bool isHealthy, ) = checkCollateralization(user);
        require(!isHealthy, "Position is healthy");
        require(!isLiquidatable[user], "Liquidation already started");

        isLiquidatable[user] = true;
        liquidationStartTime[user] = block.timestamp;

        emit LiquidationStarted(user);
    }

    function executeLiquidation(address user) public {
        require(isLiquidatable[user], "Account not marked for liquidation");
        require(
            block.timestamp >= liquidationStartTime[user] + GRACE_PERIOD,
            "Grace period not ended"
        );

        uint256 debt = userDebt[user];
        uint256 penalty = (debt * LIQUIDATION_PENALTY) / 100;
        uint256 totalToRepay = debt + penalty;

        address[] memory tokens = getAllowedCollateralTokens();
        for (uint i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 balance = collateralBalance[token][user];
            if (balance > 0) {
                collateralBalance[token][user] = 0;
                IERC20(token).transfer(msg.sender, balance);
            }
        }

        userDebt[user] = 0;
        borrowTimestamp[user] = 0;
        isLiquidatable[user] = false;
        liquidationStartTime[user] = 0;

        emit LiquidationExecuted(user, msg.sender, totalToRepay);
    }

    function recoverFromLiquidation(address token, uint256 amount) external {
        require(isLiquidatable[msg.sender], "Account not in liquidation");

        IERC20(token).transferFrom(msg.sender, address(this), amount);
        collateralBalance[token][msg.sender] += amount;

        (bool isHealthy, ) = checkCollateralization(msg.sender);
        if (isHealthy) {
            isLiquidatable[msg.sender] = false;
            liquidationStartTime[msg.sender] = 0;
        }
    }

    function getTotalCollateralValue(
        address user
    ) public view returns (uint256) {
        uint256 totalValue = 0;
        address[] memory tokens = getAllowedCollateralTokens();

        for (uint i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 balance = collateralBalance[token][user];
            if (balance > 0) {
                totalValue += (balance * getTokenValue(token)) / 1e18;
            }
        }
        return totalValue;
    }

    function getTokenValue(address token) public view returns (uint256) {
        address feedAddress = priceFeed[token];
        require(feedAddress != address(0), "Price feed not set");

        AggregatorV3Interface priceFeedContract = AggregatorV3Interface(
            feedAddress
        );
        (, int256 price, , , ) = priceFeedContract.latestRoundData();
        return uint256(price) * (10 ** (18 - priceFeedContract.decimals()));
    }

    function getMinCollateralRatio() public view returns (uint256) {
        return
            maxLiquidationThreshold > 0
                ? maxLiquidationThreshold
                : DEFAULT_LIQUIDATION_THRESHOLD;
    }

    function getLiquidationThreshold(
        address token
    ) public view returns (uint256) {
        uint256 threshold = liquidationThreshold[token];
        return threshold > 0 ? threshold : DEFAULT_LIQUIDATION_THRESHOLD;
    }

    function getAllowedCollateralTokens()
        public
        view
        returns (address[] memory)
    {
        uint count = 0;

        for (uint i = 0; i < collateralTokenList.length; i++) {
            if (isAllowedCollateral[collateralTokenList[i]]) {
                count++;
            }
        }

        address[] memory allowedTokens = new address[](count);
        uint index = 0;

        for (uint i = 0; i < collateralTokenList.length; i++) {
            address token = collateralTokenList[i];
            if (isAllowedCollateral[token]) {
                allowedTokens[index] = token;
                index++;
            }
        }

        return allowedTokens;
    }

    receive() external payable {
        totalFunds += msg.value;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function togglePause() external onlyOwner {
        paused = !paused;
        emit EmergencyPaused(paused);
    }

    function isPaused() external view returns (bool) {
        return paused;
    }

    function setLiquidator(
        address _liquidator
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        liquidator = _liquidator;
    }

    // Frontend view functions for lending
    function _nextDistributionTime() internal view returns (uint256) {
        LenderInfo memory info = lenders[msg.sender];
        if (info.balance == 0) return 0;

        // Next distribution is 24 hours from last distribution
        return info.lastInterestDistribution + SECONDS_PER_DAY;
    }

    function getWithdrawalStatus(
        address lender
    )
        public
        view
        returns (
            uint256 availableAt,
            uint256 penaltyIfWithdrawnNow,
            bool isAvailableWithoutPenalty,
            uint256 nextInterestDistribution,
            uint256 availableInterest
        )
    {
        LenderInfo memory info = lenders[lender];
        availableAt = info.depositTimestamp + WITHDRAWAL_COOLDOWN;

        // Calculate penalty only for principal amount
        penaltyIfWithdrawnNow = block.timestamp < availableAt
            ? (info.balance * EARLY_WITHDRAWAL_PENALTY) / 100
            : 0;

        isAvailableWithoutPenalty = block.timestamp >= availableAt;

        // Next interest distribution is 24 hours from last distribution
        nextInterestDistribution =
            info.lastInterestDistribution +
            SECONDS_PER_DAY;

        // Calculate available interest
        if (info.balance > 0) {
            uint256 currentIndex = _currentInterestIndex();
            availableInterest =
                ((info.balance * currentIndex) / info.interestIndex) -
                info.balance;
        }
    }

    function getLenderInfo(
        address lender
    )
        public
        view
        returns (
            uint256 balance,
            uint256 pendingInterest,
            uint256 earnedInterest,
            uint256 nextInterestUpdate,
            uint256 penaltyFreeWithdrawalTime,
            uint256 lastDistributionTime
        )
    {
        LenderInfo memory info = lenders[lender];
        balance = info.balance;
        earnedInterest = info.earnedInterest;
        penaltyFreeWithdrawalTime = info.depositTimestamp + WITHDRAWAL_COOLDOWN;
        lastDistributionTime = info.lastInterestDistribution;

        if (balance > 0) {
            uint256 currentIndex = _currentInterestIndex();
            pendingInterest =
                ((balance * currentIndex) / info.interestIndex) -
                balance;
        }

        nextInterestUpdate = _nextDistributionTime();
    }

    // Lender functions with time tracking
    function depositFunds() external payable whenNotPaused {
        if (msg.value < MIN_DEPOSIT_AMOUNT) {
            emit UserError(msg.sender, "Deposit amount too low");
            revert("Deposit amount too low");
        }
        if (msg.value + lenders[msg.sender].balance > MAX_DEPOSIT_AMOUNT) {
            emit UserError(msg.sender, "Deposit would exceed maximum limit");
            revert("Deposit would exceed maximum limit");
        }

        LenderInfo storage lender = lenders[msg.sender];
        _creditInterest(msg.sender);

        if (lender.balance == 0) {
            lender.interestIndex = _currentInterestIndex();
            lender.depositTimestamp = block.timestamp;
            if (!isKnownUser[msg.sender]) {
                isKnownUser[msg.sender] = true;
                users.push(msg.sender);
            }
        }

        lender.balance += msg.value;
        totalLent += msg.value;
        totalFunds += msg.value;

        emit FundsDeposited(msg.sender, msg.value);
    }

    function requestWithdrawal(uint256 amount) external whenNotPaused {
        LenderInfo storage lender = lenders[msg.sender];
        if (block.timestamp < lender.lastWithdrawalTime + WITHDRAWAL_COOLDOWN) {
            emit UserError(msg.sender, "Must wait for cooldown period");
            revert("Must wait for cooldown period");
        }
        if (amount > lender.balance) {
            emit UserError(msg.sender, "Insufficient balance");
            revert("Insufficient balance");
        }

        _creditInterest(msg.sender);
        lender.pendingPrincipalWithdrawal = amount; // Only for principal
        lender.withdrawalRequestTime = block.timestamp;
        lender.lastWithdrawalTime = block.timestamp;

        emit WithdrawalRequested(
            msg.sender,
            amount,
            block.timestamp + WITHDRAWAL_COOLDOWN
        );
    }

    function completeWithdrawal() external whenNotPaused noReentrancy {
        LenderInfo storage lender = lenders[msg.sender];
        if (lender.pendingPrincipalWithdrawal == 0) {
            emit UserError(msg.sender, "No pending withdrawal");
            revert("No pending withdrawal");
        }

        uint256 amount = lender.pendingPrincipalWithdrawal;
        uint256 penalty = 0;

        // Calculate penalty if withdrawing before cooldown
        if (block.timestamp < lender.depositTimestamp + WITHDRAWAL_COOLDOWN) {
            penalty = (amount * EARLY_WITHDRAWAL_PENALTY) / 100;
            amount -= penalty;
            emit EarlyWithdrawalPenalty(msg.sender, penalty);
        }

        lender.balance -= amount + penalty;
        totalLent -= amount + penalty;
        totalFunds -= amount;
        lender.pendingPrincipalWithdrawal = 0;

        payable(msg.sender).transfer(amount);
        emit FundsWithdrawn(msg.sender, amount, penalty);
    }

    // Interest calculation core
    function _getInterestRate(uint256 amount) internal view returns (uint256) {
        for (uint i = interestTiers.length; i > 0; i--) {
            if (amount >= interestTiers[i - 1].minAmount) {
                return interestTiers[i - 1].rate;
            }
        }
        return currentDailyRate;
    }

    function _currentInterestIndex() internal view returns (uint256) {
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 daysElapsed = currentDay - lastRateUpdateDay;

        if (daysElapsed == 0) {
            return
                dailyInterestRate[currentDay] > 0
                    ? dailyInterestRate[currentDay]
                    : currentDailyRate;
        }

        uint256 index = currentDailyRate;
        for (uint256 i = 0; i < daysElapsed; i++) {
            index = (index * _getInterestRate(totalLent)) / 1e18;
        }
        return index;
    }

    function _creditInterest(address lender) internal {
        LenderInfo storage info = lenders[lender];
        if (info.balance == 0) return;

        uint256 currentIndex = _currentInterestIndex();
        uint256 interest = ((info.balance * currentIndex) /
            info.interestIndex) - info.balance;

        if (interest > 0) {
            info.earnedInterest += interest;
            info.balance += interest;
            totalLent += interest;
            info.lastInterestDistribution = block.timestamp;
            emit InterestCredited(lender, interest);
        }

        info.interestIndex = currentIndex;
        info.lastInterestUpdate = block.timestamp;
    }

    function _updateGlobalInterest() internal {
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        if (currentDay > lastRateUpdateDay) {
            dailyInterestRate[currentDay] = _currentInterestIndex();
            lastRateUpdateDay = currentDay;
        }
    }

    function calculateInterest(
        address lender
    ) public view returns (uint256 interest) {
        LenderInfo memory info = lenders[lender];
        if (info.balance == 0) return 0;

        uint256 currentIndex = _currentInterestIndex();
        uint256 daysElapsed = (block.timestamp - info.lastInterestUpdate) /
            SECONDS_PER_DAY;

        if (daysElapsed > 0) {
            interest =
                ((info.balance * currentIndex) / info.interestIndex) -
                info.balance;
            for (uint256 i = 0; i < daysElapsed; i++) {
                interest = (interest * currentIndex) / 1e18;
            }
        }

        return interest;
    }

    function claimInterest() external whenNotPaused {
        LenderInfo storage lender = lenders[msg.sender];
        if (lender.balance == 0) {
            emit UserError(msg.sender, "No funds deposited");
            revert("No funds deposited");
        }

        _creditInterest(msg.sender);
        uint256 interest = lender.earnedInterest;
        if (interest == 0) {
            emit UserError(msg.sender, "No interest to claim");
            revert("No interest to claim");
        }

        lender.earnedInterest = 0;
        totalLent -= interest;
        totalFunds -= interest;

        payable(msg.sender).transfer(interest);
        emit InterestClaimed(msg.sender, interest);
    }

    function getHistoricalRates(
        uint256 startDay,
        uint256 endDay
    ) external view returns (uint256[] memory rates) {
        require(endDay >= startDay, "Invalid date range");
        rates = new uint256[](endDay - startDay + 1);

        for (uint256 i = 0; i <= endDay - startDay; i++) {
            rates[i] = dailyInterestRate[startDay + i];
        }
        return rates;
    }

    function calculatePotentialInterest(
        uint256 amount,
        uint256 numDays
    ) external view returns (uint256) {
        uint256 currentIndex = _currentInterestIndex();
        uint256 potentialIndex = currentIndex;

        for (uint256 i = 0; i < numDays; i++) {
            potentialIndex = (potentialIndex * currentDailyRate) / 1e18;
        }

        return ((amount * potentialIndex) / currentIndex) - amount;
    }

    // Admin function to manage interest tiers
    function setInterestTier(
        uint256 index,
        uint256 minAmount,
        uint256 rate
    ) external onlyOwner {
        require(rate >= 1e18, "Rate must be >= 1");
        if (index >= interestTiers.length) {
            interestTiers.push(InterestTier(minAmount, rate));
        } else {
            interestTiers[index] = InterestTier(minAmount, rate);
        }
    }

    function getInterestTier(
        uint256 index
    ) external view returns (uint256 minAmount, uint256 rate) {
        require(index < interestTiers.length, "Invalid tier index");
        InterestTier memory tier = interestTiers[index];
        return (tier.minAmount, tier.rate);
    }

    function getInterestTierCount() external view returns (uint256) {
        return interestTiers.length;
    }

    function getAvailableInterest(
        address lender
    ) external view returns (uint256) {
        LenderInfo memory info = lenders[lender];
        if (info.balance == 0) return 0;

        uint256 currentIndex = _currentInterestIndex();
        return
            ((info.balance * currentIndex) / info.interestIndex) - info.balance;
    }

    function canCompleteWithdrawal(
        address lender
    ) external view returns (bool) {
        LenderInfo memory info = lenders[lender];
        if (info.pendingPrincipalWithdrawal == 0) return false;
        return
            block.timestamp >= info.withdrawalRequestTime + WITHDRAWAL_COOLDOWN;
    }

    function cancelPrincipalWithdrawal() external whenNotPaused {
        LenderInfo storage lender = lenders[msg.sender];
        if (lender.pendingPrincipalWithdrawal == 0) {
            emit UserError(msg.sender, "No pending withdrawal to cancel");
            revert("No pending withdrawal to cancel");
        }

        uint256 amount = lender.pendingPrincipalWithdrawal;
        lender.pendingPrincipalWithdrawal = 0;
        lender.withdrawalRequestTime = 0;

        emit WithdrawalCancelled(msg.sender, amount);
    }
}
