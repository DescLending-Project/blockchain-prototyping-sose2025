// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "./StablecoinManager.sol";
import "./LendingManager.sol";

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
    address[] public users;
    mapping(address => bool) public isKnownUser;

    uint256 public constant GRACE_PERIOD = 3 days;
    uint256 public constant DEFAULT_LIQUIDATION_THRESHOLD = 130;
    uint256 public constant LIQUIDATION_PENALTY = 5;

    uint256 public totalFunds;
    bool public locked;
    bool public paused;

    address public liquidator;

    StablecoinManager public stablecoinManager;
    LendingManager public lendingManager;

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

    function initialize(
        address initialOwner,
        address _stablecoinManager,
        address _lendingManager
    ) public initializer {
        __Ownable_init(initialOwner);
        __AccessControl_init();
        _setRoleAdmin(DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);

        stablecoinManager = StablecoinManager(_stablecoinManager);
        lendingManager = LendingManager(payable(_lendingManager));
    }

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
                uint256 deadline = liquidationStartTime[user] + GRACE_PERIOD;
                if (block.timestamp >= deadline) {
                    toLiquidate[count] = user;
                    count++;
                }
            }
        }

        if (count > 0) {
            address[] memory result = new address[](count);
            for (uint j = 0; j < count; j++) {
                result[j] = toLiquidate[j];
            }
            upkeepNeeded = true;
            performData = abi.encode(result);
        } else {
            upkeepNeeded = false;
        }
    }

    function performUpkeep(bytes calldata performData) external override {
        address[] memory liquidatableUsers = abi.decode(
            performData,
            (address[])
        );

        for (uint i = 0; i < liquidatableUsers.length; i++) {
            address user = liquidatableUsers[i];
            if (isLiquidatable[user]) {
                uint256 deadline = liquidationStartTime[user] + GRACE_PERIOD;
                if (block.timestamp >= deadline) {
                    executeLiquidation(user);
                }
            }
        }
    }

    function setAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        _transferOwnership(newAdmin);
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function getAdmin() external view returns (address) {
        return owner();
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
        if (userDebt[msg.sender] != 0) {
            emit UserError(msg.sender, "Repay your existing debt first");
            revert("Repay your existing debt first");
        }

        if (!isKnownUser[msg.sender]) {
            isKnownUser[msg.sender] = true;
            users.push(msg.sender);
        }

        uint256 collateralValue = getTotalCollateralValue(msg.sender);
        if (collateralValue * 100 < amount * DEFAULT_LIQUIDATION_THRESHOLD) {
            emit UserError(msg.sender, "Insufficient collateral for this loan");
            revert("Insufficient collateral for this loan");
        }

        userDebt[msg.sender] += amount;
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

        if (msg.value > userDebt[msg.sender]) {
            emit UserError(msg.sender, "Repayment exceeds total debt");
            revert("Repayment exceeds total debt");
        }

        userDebt[msg.sender] -= msg.value;

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
        payable(owner()).transfer(amount);
        emit Extracted(owner(), amount);
    }

    function withdrawForLendingManager(uint256 amount) external noReentrancy {
        require(
            msg.sender == address(lendingManager),
            "Only lending manager can call this"
        );
        require(
            amount <= address(this).balance,
            "Insufficient contract balance"
        );
        payable(msg.sender).transfer(amount);
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

    function getMinCollateralRatio() public pure returns (uint256) {
        return DEFAULT_LIQUIDATION_THRESHOLD;
    }

    function getLiquidationThreshold(
        address token
    ) public view returns (uint256) {
        uint256 stablecoinThreshold = stablecoinManager.getLiquidationThreshold(
            token
        );
        if (stablecoinThreshold > 0) {
            return stablecoinThreshold;
        }
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

    function getMaxBorrowAmount(
        address user,
        address token
    ) public view returns (uint256) {
        uint256 collateralValue = (collateralBalance[token][user] *
            getTokenValue(token)) / 1e18;
        uint256 ltv = stablecoinManager.getLTV(token);
        return (collateralValue * ltv) / 100;
    }

    function setLendingManager(address _lendingManager) external onlyOwner {
        require(
            _lendingManager != address(0),
            "Invalid lending manager address"
        );
        lendingManager = LendingManager(payable(_lendingManager));
    }
}
