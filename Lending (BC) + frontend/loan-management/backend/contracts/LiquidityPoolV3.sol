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
import "./IntegratedCreditSystem.sol";

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
    
    // ZK-Proof Integration
    IntegratedCreditSystem public creditSystem;
    bool public zkProofRequired; // Whether ZK proofs are required for borrowing

    // Risk Tier Definitions (0-100 score range)
    enum RiskTier {
        TIER_1, // 90-100 (Excellent)
        TIER_2, // 80-89 (Good)
        TIER_3, // 70-79 (Fair)
        TIER_4, // 60-69 (Marginal)
        TIER_5 // 0-59 (Poor - not eligible)
    }

    // Risk tier configuration for borrowing
    struct BorrowTierConfig {
        uint256 minScore; // Minimum credit score (inclusive)
        uint256 maxScore; // Maximum credit score (inclusive)
        uint256 collateralRatio; // Required collateral ratio (e.g., 110 = 110%)
        int256 interestRateModifier; // Percentage adjustment to base rate (e.g., -20 = 20% discount)
        uint256 maxLoanAmount; // Maximum loan amount as % of pool
    }

    // Default tier configuration for borrowing
    BorrowTierConfig[] public borrowTierConfigs;

    // Track borrowed amount by risk tier
    mapping(RiskTier => uint256) public borrowedAmountByRiskTier;
    // Track protocol-wide repayment performance
    uint256 public totalBorrowedAllTime;
    uint256 public totalRepaidAllTime;

    // Oracle staleness config per token
    mapping(address => uint256) public maxPriceAge; // in seconds
    event StaleOracleTriggered(
        address indexed token,
        uint256 updatedAt,
        uint256 currentTime
    );

    // Set default staleness windows (stablecoins: 1h, volatile: 15min)
    uint256 public constant DEFAULT_STALENESS_STABLE = 3600; // 1 hour
    uint256 public constant DEFAULT_STALENESS_VOLATILE = 900; // 15 min

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
    
    // ZK-Proof Integration Events
    event CreditSystemUpdated(address indexed oldSystem, address indexed newSystem);
    event ZKProofRequirementToggled(bool required);
    event ZKProofValidationFailed(address indexed user, string reason);

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
    
    modifier requiresZKProof() {
        if (zkProofRequired && address(creditSystem) != address(0)) {
            require(creditSystem.isEligibleToBorrow(msg.sender), "ZK proof verification required");
        }
        _;
    }

    function initialize(
        address initialOwner,
        address _stablecoinManager,
        address _lendingManager,
        address _creditSystem
    ) public initializer {
        __Ownable_init(initialOwner);
        __AccessControl_init();
        _setRoleAdmin(DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);

        stablecoinManager = StablecoinManager(_stablecoinManager);
        lendingManager = LendingManager(payable(_lendingManager));
        
        // Initialize ZK-proof system
        if (_creditSystem != address(0)) {
            creditSystem = IntegratedCreditSystem(_creditSystem);
            zkProofRequired = true; // Enable ZK proof requirement by default
        }

        _initializeRiskTiers();
    }

    // Initialize the risk tier system (should be called in initialize function)
    function _initializeRiskTiers() internal {
        // Tier 1: 90-100 score, 110% collateral, 25% discount, can borrow up to 50% of pool
        borrowTierConfigs.push(BorrowTierConfig(90, 100, 110, -25, 50));

        // Tier 2: 80-89 score, 125% collateral, 10% discount, can borrow up to 40% of pool
        borrowTierConfigs.push(BorrowTierConfig(80, 89, 125, -10, 40));

        // Tier 3: 70-79 score, 140% collateral, standard rate, can borrow up to 30% of pool
        borrowTierConfigs.push(BorrowTierConfig(70, 79, 140, 0, 30));

        // Tier 4: 60-69 score, 160% collateral, 15% premium, can borrow up to 20% of pool
        borrowTierConfigs.push(BorrowTierConfig(60, 69, 160, 15, 20));

        // Tier 5: 0-59 score, not eligible for standard borrowing
        borrowTierConfigs.push(BorrowTierConfig(0, 59, 200, 30, 0));
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
        require(
            block.timestamp > lastUpkeep + UPKEEP_COOLDOWN,
            "Upkeep throttled"
        );
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
        require(
            block.timestamp > lastUpkeep + UPKEEP_COOLDOWN,
            "Upkeep throttled"
        );
        lastUpkeep = block.timestamp;
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

    // Get user's risk tier
    function getRiskTier(address user) public view returns (RiskTier) {
        uint256 score = creditScore[user];

        for (uint256 i = 0; i < borrowTierConfigs.length; i++) {
            if (
                score >= borrowTierConfigs[i].minScore &&
                score <= borrowTierConfigs[i].maxScore
            ) {
                return RiskTier(i);
            }
        }

        return RiskTier(borrowTierConfigs.length - 1); // Default to lowest tier
    }

    // Admin function to update tier configurations
    function updateBorrowTier(
        uint256 tierIndex,
        uint256 minScore,
        uint256 maxScore,
        uint256 collateralRatio,
        int256 interestRateModifier,
        uint256 maxLoanAmount
    ) external onlyOwner {
        require(tierIndex < borrowTierConfigs.length, "Invalid tier");
        borrowTierConfigs[tierIndex] = BorrowTierConfig(
            minScore,
            maxScore,
            collateralRatio,
            interestRateModifier,
            maxLoanAmount
        );
    }

    // Get complete tier configuration for a user
    function getBorrowTerms(
        address user
    )
        public
        view
        returns (
            uint256 collateralRatio,
            int256 interestRateModifier,
            uint256 maxLoanAmount
        )
    {
        RiskTier tier = getRiskTier(user);
        BorrowTierConfig memory config = borrowTierConfigs[uint256(tier)];
        return (
            config.collateralRatio,
            config.interestRateModifier,
            (totalFunds * config.maxLoanAmount) / 100
        );
    }

    //function borrow(uint256 amount) external whenNotPaused noReentrancy {
    function borrow(uint256 amount) external whenNotPaused noReentrancy requiresZKProof {
        if (amount == 0) {
            emit UserError(msg.sender, "Amount must be greater than 0");
            revert("Amount must be greater than 0");
        }

        // Get user's risk tier and terms
        RiskTier tier = getRiskTier(msg.sender);
        (
            uint256 requiredRatio,
            int256 rateModifier,
            uint256 tierMaxAmount
        ) = getBorrowTerms(msg.sender);

        if (tier == RiskTier.TIER_5) {
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

        // Add additional tier-based limit check
        if (amount > tierMaxAmount) {
            emit UserError(msg.sender, "Borrow amount exceeds your tier limit");
            revert("Borrow amount exceeds your tier limit");
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
        if (collateralValue * 100 < amount * requiredRatio) {
            emit UserError(msg.sender, "Insufficient collateral for this loan");
            revert("Insufficient collateral for this loan");
        }

        // Calculate adjusted interest rate (stored but not used in this function)
        uint256 baseRate = lendingManager.getInterestRate(amount);
        uint256 adjustedRate = baseRate;
        if (rateModifier < 0) {
            adjustedRate = (baseRate * (100 - uint256(-rateModifier))) / 100;
        } else if (rateModifier > 0) {
            adjustedRate = (baseRate * (100 + uint256(rateModifier))) / 100;
        }

        userDebt[msg.sender] += amount;
        borrowTimestamp[msg.sender] = block.timestamp;
        // Track borrowed amount by risk tier
        borrowedAmountByRiskTier[tier] += amount;
        // Track protocol-wide borrowing
        totalBorrowedAllTime += amount;

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

        RiskTier tier = getRiskTier(msg.sender);
        // Remove from borrowedAmountByRiskTier
        borrowedAmountByRiskTier[tier] -= msg.value;
        userDebt[msg.sender] -= msg.value;
        // Track protocol-wide repayment
        totalRepaidAllTime += msg.value;

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
        // If ZK-proof system is active, try to get score from there first
        if (address(creditSystem) != address(0)) {
            try creditSystem.getUserCreditProfile(user) returns (
                bool hasTradFi,
                bool hasAccount,
                bool hasNesting,
                uint256 finalScore,
                bool isEligible,
                uint256 lastUpdate
            ) {
                if (finalScore > 0) {
                    return finalScore;
                }
            } catch {
                // Fall back to stored score if ZK system fails
            }
        }
        return creditScore[user];
    }
    
    function updateCreditScoreFromZK(
        address user,
        uint256 score
    ) external {
        require(msg.sender == address(creditSystem), "Only credit system can update");
        require(score <= 100, "Score out of range");
        
        uint256 oldScore = creditScore[user];
        creditScore[user] = score;
        
        emit CreditScoreAssigned(user, score);
    }
    
    /// @notice Set the integrated credit system
    /// @param _creditSystem Address of the credit system contract
    function setCreditSystem(address _creditSystem) external onlyOwner {
        address oldSystem = address(creditSystem);
        creditSystem = IntegratedCreditSystem(_creditSystem);
        emit CreditSystemUpdated(oldSystem, _creditSystem);
    }
    
    /// @notice Toggle ZK proof requirement for borrowing
    /// @param required Whether ZK proofs are required
    function setZKProofRequirement(bool required) external onlyOwner {
        zkProofRequired = required;
        emit ZKProofRequirementToggled(required);
    }
    

    function getZKVerificationStatus(address user) 
        external 
        view 
        returns (
            bool hasTradFi,
            bool hasAccount,
            bool hasNesting,
            uint256 finalScore,
            bool isEligible
        ) 
    {
        if (address(creditSystem) != address(0)) {
            try creditSystem.getUserCreditProfile(user) returns (
                bool tradFi,
                bool account,
                bool nesting,
                uint256 score,
                bool eligible,
                uint256 lastUpdate
            ) {
                return (tradFi, account, nesting, score, eligible);
            } catch {
                return (false, false, false, 0, false);
            }
        }
        return (false, false, false, 0, false);
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

        // Get tier-specific required ratio
        (uint256 requiredRatio, , ) = getBorrowTerms(user);
        ratio = (totalCollateralValue * 100) / debt;
        isHealthy = ratio >= requiredRatio;
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
        // Check all oracles for user's collateral
        address[] memory tokens = getAllowedCollateralTokens();
        for (uint i = 0; i < tokens.length; i++) {
            require(
                isOracleHealthy(tokens[i]),
                "Oracle circuit breaker triggered"
            );
        }

        uint256 debt = userDebt[user];
        uint256 penalty = (debt * LIQUIDATION_PENALTY) / 100;
        uint256 totalToRepay = debt + penalty;

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
        // Remove all debt from borrowedAmountByRiskTier
        borrowedAmountByRiskTier[getRiskTier(user)] -= debt;
        // Track protocol-wide repayment (treat as repaid for risk purposes)
        totalRepaidAllTime += debt;

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
        (uint256 price, ) = _getFreshPrice(token);
        AggregatorV3Interface pf = AggregatorV3Interface(priceFeed[token]);
        return price * (10 ** (18 - pf.decimals()));
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

    // --- Weighted Risk Score (View) ---
    function getWeightedRiskScore() public view returns (uint256) {
        uint256 weightedSum;
        uint256 validBorrowed;
        weightedSum += borrowedAmountByRiskTier[RiskTier.TIER_1] * 1;
        weightedSum += borrowedAmountByRiskTier[RiskTier.TIER_2] * 2;
        weightedSum += borrowedAmountByRiskTier[RiskTier.TIER_3] * 3;
        weightedSum += borrowedAmountByRiskTier[RiskTier.TIER_4] * 4;
        validBorrowed =
            borrowedAmountByRiskTier[RiskTier.TIER_1] +
            borrowedAmountByRiskTier[RiskTier.TIER_2] +
            borrowedAmountByRiskTier[RiskTier.TIER_3] +
            borrowedAmountByRiskTier[RiskTier.TIER_4];
        if (validBorrowed == 0) return 0;
        return weightedSum / validBorrowed; // returns 1 to 4
    }

    // --- Risk Multiplier (View) ---
    function getRiskMultiplier() public view returns (uint256) {
        uint256 score = getWeightedRiskScore();
        if (score == 0) return 1e18; // fallback
        if (score <= 1) return 9e17; // safer pool → 0.9
        if (score <= 2) return 1e18; // neutral → 1.0
        if (score <= 3) return 11e17; // more risk → 1.1
        return 12e17; // highest risk → 1.2
    }

    // --- Repayment Ratio (View) ---
    function getRepaymentRatio() public view returns (uint256) {
        if (totalBorrowedAllTime == 0) return 1e18; // default 100%
        return (totalRepaidAllTime * 1e18) / totalBorrowedAllTime;
    }

    // --- Repayment Risk Multiplier (View) ---
    function getRepaymentRiskMultiplier() public view returns (uint256) {
        uint256 ratio = getRepaymentRatio(); // 0 to 1e18
        if (ratio >= 95e16) return 1e18; // >=95% repaid → 1.0x
        if (ratio >= 90e16) return 105e16; // 90-94% → 1.05x
        if (ratio >= 80e16) return 110e16; // 80-89% → 1.10x
        return 120e16; // <80% → 1.20x
    }

    // --- Global Risk Multiplier (View) ---
    function getGlobalRiskMultiplier() public view returns (uint256) {
        uint256 tierMult = getRiskMultiplier();
        uint256 repayMult = getRepaymentRiskMultiplier();
        return (tierMult * repayMult) / 1e18;
    }

    // --- Real-Time Return Rate for Lender (View) ---
    function getRealTimeReturnRate(
        address lender
    ) external view returns (uint256) {
        uint256 baseAPR = baseLenderAPR(lender); // e.g. 0.06e18 = 6%
        uint256 globalMult = getGlobalRiskMultiplier();
        return (baseAPR * globalMult) / 1e18;
    }

    // --- Base APR for Lender (stub, replace with real logic) ---
    function baseLenderAPR(address lender) public view returns (uint256) {
        // TODO: Replace with actual calculation from LendingManager
        // For now, return 6% APR (0.06e18)
        return 6e16;
    }

    // --- Borrower Rate (View, for future use) ---
    function getBorrowerRate(RiskTier tier) public view returns (uint256) {
        // Example: use base rate per tier (not implemented here), apply global multiplier
        // uint256 baseRate = baseBorrowRateByTier[tier];
        // return (baseRate * getGlobalRiskMultiplier()) / 1e18;
        return 0; // Placeholder
    }

    // --- Throttling for automation ---
    uint256 public lastUpkeep;
    uint256 public constant UPKEEP_COOLDOWN = 60; // 1 min

    function setMaxPriceAge(address token, uint256 age) external onlyOwner {
        require(age <= 1 days, "Too large");
        maxPriceAge[token] = age;
    }

    // Helper: get staleness window for token
    function _getMaxPriceAge(address token) internal view returns (uint256) {
        uint256 age = maxPriceAge[token];
        if (age > 0) return age;
        // Use StablecoinManager to check if stablecoin
        if (stablecoinManager.isStablecoin(token))
            return DEFAULT_STALENESS_STABLE;
        return DEFAULT_STALENESS_VOLATILE;
    }

    // Oracle health check for a token
    function isOracleHealthy(address token) public view returns (bool) {
        address feedAddress = priceFeed[token];
        if (feedAddress == address(0)) return false;
        AggregatorV3Interface pf = AggregatorV3Interface(feedAddress);
        (uint80 roundId, , , uint256 updatedAt, uint80 answeredInRound) = pf
            .latestRoundData();
        if (block.timestamp - updatedAt > _getMaxPriceAge(token)) return false;
        if (answeredInRound < roundId) return false;
        return true;
    }

    // --- Price feed with staleness check ---
    function _getFreshPrice(
        address token
    ) internal view returns (uint256 price, uint256 updatedAt) {
        address feedAddress = priceFeed[token];
        require(feedAddress != address(0), "Price feed not set");
        AggregatorV3Interface pf = AggregatorV3Interface(feedAddress);
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt_,
            uint80 answeredInRound
        ) = pf.latestRoundData();
        if (block.timestamp - updatedAt_ > _getMaxPriceAge(token)) {
            revert("Stale price");
        }
        require(answeredInRound >= roundId, "Stale round data");
        return (uint256(answer), updatedAt_);
    }
}
