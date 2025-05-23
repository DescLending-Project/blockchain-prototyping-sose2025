// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol"; // Add this import
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// Inherit from AccessControlUpgradeable in addition to OwnableUpgradeable
contract LiquidityPoolV3 is Initializable, OwnableUpgradeable, AccessControlUpgradeable {
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
        __AccessControl_init(); // Initialize AccessControl
        // Set the initialOwner as the DEFAULT_ADMIN_ROLE
        _setRoleAdmin(DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
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
        require(isAllowedCollateral[token], "Token not allowed");
        require(amount > 0, "Amount must be > 0");
        require(!isLiquidatable[msg.sender], "Account is in liquidation");

        IERC20(token).transferFrom(msg.sender, address(this), amount);
        collateralBalance[token][msg.sender] += amount;

        emit CollateralDeposited(msg.sender, token, amount);
    }

    function withdrawCollateral(address token, uint256 amount) external {
        require(isAllowedCollateral[token], "Token not allowed");
        require(
            collateralBalance[token][msg.sender] >= amount,
            "Insufficient balance"
        );
        require(!isLiquidatable[msg.sender], "Account is in liquidation");

        // check if user still has enough collateral after withdrawal
        uint256 newCollateralValue = getTotalCollateralValue(msg.sender) -
            ((amount * getTokenValue(token)) / 1e18);

        require(
            newCollateralValue * 100 >=
                userDebt[msg.sender] * getLiquidationThreshold(token),
            "Withdrawal would make position undercollateralized"
        );

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
        require(amount > 0, "Amount must be greater than 0");
        require(creditScore[msg.sender] >= 60, "Credit score too low");
        require(amount <= totalFunds / 2, "Insufficient funds in the pool");
        require(userDebt[msg.sender] == 0, "Repay your existing debt first");

        uint256 collateralValue = getTotalCollateralValue(msg.sender);

        // make sure collateral is enough for the new loan
        require(
            collateralValue * 100 >= amount * DEFAULT_LIQUIDATION_THRESHOLD,
            "Insufficient collateral for this loan"
        );

        userDebt[msg.sender] += amount;
        totalFunds -= amount;
        borrowTimestamp[msg.sender] = block.timestamp;

        payable(msg.sender).transfer(amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay() external payable whenNotPaused {
        require(userDebt[msg.sender] > 0, "No outstanding debt");
        require(msg.value >= userDebt[msg.sender], "Repayment too low");
        require(msg.value > 0, "Must send funds to repay");

        uint repayAmount = msg.value > userDebt[msg.sender]
            ? userDebt[msg.sender]
            : msg.value;

        userDebt[msg.sender] -= repayAmount;
        totalFunds += repayAmount;
        borrowTimestamp[msg.sender] = 0;

        if (isLiquidatable[msg.sender]) {
            isLiquidatable[msg.sender] = false;
            liquidationStartTime[msg.sender] = 0;
        }
        emit Repaid(msg.sender, repayAmount);
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

    // https://docs.chain.link/data-feeds/price-feeds/addresses?page=1&testnetPage=1
    function setPriceFeed(address token, address feed) external onlyOwner {
        require(isAllowedCollateral[token], "Token not allowed as collateral");
        priceFeed[token] = feed;
    }

    function setLiquidationThreshold(
        address token,
        uint256 threshold
    ) external onlyOwner {
        require(isAllowedCollateral[token], "Token not allowed as collateral");
        require(threshold > 100, "Threshold must be > 100%");
        liquidationThreshold[token] = threshold;
    }

    function checkCollateralization(
        address user
    ) public view returns (bool isHealthy, uint256 ratio) {
        uint256 totalCollateralValue = getTotalCollateralValue(user);
        uint256 debt = userDebt[user];

        if (debt == 0) return (true, type(uint256).max);

        ratio = (totalCollateralValue * 100) / debt;
        isHealthy = ratio >= getMinCollateralRatio();
    }

    function startLiquidation(address user) external {
        (bool isHealthy, ) = checkCollateralization(user);
        require(!isHealthy, "Position is healthy");
        require(!isLiquidatable[user], "Liquidation already started");

        isLiquidatable[user] = true;
        liquidationStartTime[user] = block.timestamp;

        emit LiquidationStarted(user);
    }

    function executeLiquidation(address user) external {
        require(isLiquidatable[user], "Account not marked for liquidation");
        require(
            block.timestamp >= liquidationStartTime[user] + GRACE_PERIOD,
            "Grace period not ended"
        );

        uint256 debt = userDebt[user];
        uint256 penalty = (debt * LIQUIDATION_PENALTY) / 100;
        uint256 totalToRepay = debt + penalty;

        // transfer all user's collateral to the liquidator
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

    // deposit more collateral to stop liquidation
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

    // calculate total USD value of all user's collateral
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

    // get USD price of 1 token using Chainlink
    function getTokenValue(address token) public view returns (uint256) {
        address feedAddress = priceFeed[token];
        require(feedAddress != address(0), "Price feed not set");

        AggregatorV3Interface priceFeedContract = AggregatorV3Interface(
            feedAddress
        );
        (, int256 price, , , ) = priceFeedContract.latestRoundData();
        return uint256(price) * (10 ** (18 - priceFeedContract.decimals()));
    }

    function getMinCollateralRatio() public pure returns (uint256) {
        return DEFAULT_LIQUIDATION_THRESHOLD;
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

    // Use the correct modifier and role
    function setLiquidator(address _liquidator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        liquidator = _liquidator;
    }

function getAdmin() external view returns (address) {
        address admin = owner();
        require(admin != address(0), "No admin set");
        return admin;
    }
}