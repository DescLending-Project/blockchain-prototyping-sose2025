// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "./interfaces/AggregatorV3Interface.sol";
import "./StablecoinManager.sol";
import "./LendingManager.sol";
import "./InterestRateModel.sol";

contract LiquidityPool is
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
    // Remove getLTV and getLiquidationThreshold logic from LiquidityPool
    // Update all references to use stablecoinManager.getLTV(token) and stablecoinManager.getLiquidationThreshold(token)
    // Remove per-token threshold/ltv logic from this contract
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
    InterestRateModel public interestRateModel;

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

    // --- New for Partial Liquidation and Tiered Fees ---
    uint256 public constant SAFETY_BUFFER = 10; // 10% over-collateralization
    uint256 public minPartialLiquidationAmount;
    address public reserveAddress;
    struct TierFee {
        uint256 originationFee; // in basis points (e.g., 10 = 0.1%)
        uint256 lateFeeAPR; // in basis points annualized (e.g., 500 = 5%)
    }
    mapping(uint256 => TierFee) public tierFees; // tier index => fees
    event PartialLiquidation(
        address indexed user,
        address indexed liquidator,
        address indexed collateralToken,
        uint256 collateralSeized,
        uint256 debtRepaid
    );
    event FeeCollected(
        address indexed user,
        uint256 amount,
        string feeType,
        uint256 tier
    );
    event ReserveAddressUpdated(address indexed newReserve);
    event TierFeeUpdated(
        uint256 indexed tier,
        uint256 originationFee,
        uint256 lateFeeAPR
    );
    // --- End new state/events ---

    // --- Loan Application and Amortization ---
    struct Loan {
        uint256 principal;
        uint256 outstanding;
        uint256 interestRate; // 1e18 fixed point
        uint256 nextDueDate;
        uint256 installmentAmount;
        uint256 penaltyBps;
        bool active;
    }

    mapping(address => Loan) public loans;

    // --- Application Events ---
    event LoanApplied(
        address indexed applicant,
        uint256 amount,
        uint256 collateral
    );
    event LoanApproved(address indexed applicant, uint256 amount);
    event LoanRejected(address indexed applicant, uint256 amount);
    event LoanDisbursed(address indexed borrower, uint256 amount, uint256 rate);
    event LoanInstallmentPaid(
        address indexed borrower,
        uint256 amount,
        uint256 remaining
    );
    event LoanFullyRepaid(address indexed borrower);
    event LoanLatePenaltyApplied(address indexed borrower, uint256 penalty);

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
        address _lendingManager,
        address _interestRateModel
    ) public initializer {
        __Ownable_init(initialOwner);
        __AccessControl_init();
        _setRoleAdmin(DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);

        stablecoinManager = StablecoinManager(_stablecoinManager);
        lendingManager = LendingManager(payable(_lendingManager));
        interestRateModel = InterestRateModel(_interestRateModel);

        _initializeRiskTiers();

        // Set default for upgrade-safe storage
        minPartialLiquidationAmount = 1e16;
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
            userDebt[msg.sender] *
                stablecoinManager.getLiquidationThreshold(token)
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

    // Get dynamic borrower rate for a user based on utilization and risk tier
    function getBorrowerRate(address user) public view returns (uint256) {
        uint256 totalSupplied = totalFunds;
        uint256 totalBorrowed = totalBorrowedAllTime - totalRepaidAllTime;
        uint256 utilization = totalSupplied > 0
            ? (totalBorrowed * 1e18) / totalSupplied
            : 0;
        uint256 baseRate = interestRateModel.getBorrowRate(utilization);
        (, int256 modifierBps, ) = getBorrowTerms(user);
        uint256 adjustedRate = baseRate;
        if (modifierBps < 0) {
            adjustedRate = (baseRate * (10000 - uint256(-modifierBps))) / 10000;
        } else if (modifierBps > 0) {
            adjustedRate = (baseRate * (10000 + uint256(modifierBps))) / 10000;
        }
        return adjustedRate;
    }

    // Helper function to calculate dynamic rate
    function _calculateBorrowRate(
        uint256 amount,
        RiskTier tier
    ) internal view returns (uint256) {
        uint256 totalSupplied = totalFunds;
        uint256 totalBorrowed = totalBorrowedAllTime - totalRepaidAllTime;
        uint256 utilization = 0;
        if (totalSupplied > 0) {
            utilization = (totalBorrowed * 1e18) / totalSupplied;
        }
        uint256 baseRate = interestRateModel.getBorrowRate(utilization);
        int256 modifierBps = borrowTierConfigs[uint256(tier)]
            .interestRateModifier;
        uint256 adjustedRate = baseRate;
        if (modifierBps < 0) {
            adjustedRate = (baseRate * (10000 - uint256(-modifierBps))) / 10000;
        } else if (modifierBps > 0) {
            adjustedRate = (baseRate * (10000 + uint256(modifierBps))) / 10000;
        }
        return adjustedRate;
    }

    // Helper function to create loan
    function _createLoan(uint256 amount, uint256 rate) internal {
        uint256 installment = amount / 12;
        uint256 nextDue = block.timestamp + 30 days;
        loans[msg.sender] = Loan({
            principal: amount,
            outstanding: amount,
            interestRate: rate,
            nextDueDate: nextDue,
            installmentAmount: installment,
            penaltyBps: 500, // 5% default
            active: true
        });
    }

    function borrow(
        uint256 amount
    ) external payable whenNotPaused noReentrancy {
        // 1. Check for existing debt
        require(userDebt[msg.sender] == 0, "Repay your existing debt first");

        // 2. Check for credit score (TIER_5)
        RiskTier tier = getRiskTier(msg.sender);
        require(tier != RiskTier.TIER_5, "Credit score too low");

        // 3. Check for available lending capacity (not more than half the pool)
        require(
            amount <= totalFunds / 2,
            "Borrow amount exceeds available lending capacity"
        );

        // 4. Check for tier limit
        (, , uint256 maxLoanAmount) = getBorrowTerms(msg.sender);
        require(
            amount <= maxLoanAmount,
            "Borrow amount exceeds your tier limit"
        );

        // 5. Check for sufficient collateral
        (uint256 requiredRatio, , ) = getBorrowTerms(msg.sender);
        uint256 collateralValue = getTotalCollateralValue(msg.sender);
        require(
            collateralValue * 100 >= amount * requiredRatio,
            "Insufficient collateral for this loan"
        );

        // 6. Calculate and apply origination fee
        uint256 originationFee = 0;
        if (reserveAddress != address(0)) {
            originationFee =
                (amount * tierFees[uint256(tier)].originationFee) /
                10000;
        }
        uint256 netAmount = amount - originationFee;

        // 7. Transfer origination fee to reserve if applicable
        if (originationFee > 0) {
            payable(reserveAddress).transfer(originationFee);
            emit FeeCollected(
                msg.sender,
                originationFee,
                "origination",
                uint256(tier)
            );
        }

        // 8. Calculate dynamic rate
        uint256 adjustedRate = _calculateBorrowRate(amount, tier);

        // 9. Create loan
        require(amount >= 12, "Loan amount too small for amortization");
        _createLoan(amount, adjustedRate);

        // 10. Update state
        userDebt[msg.sender] = amount;
        borrowTimestamp[msg.sender] = block.timestamp;
        borrowedAmountByRiskTier[tier] += amount;
        totalBorrowedAllTime += amount;

        // 11. Transfer net amount to borrower (after deducting origination fee)
        payable(msg.sender).transfer(netAmount);

        emit LoanDisbursed(msg.sender, amount, adjustedRate);
        emit Borrowed(msg.sender, amount);
    }

    function repayInstallment() external payable whenNotPaused {
        Loan storage loan = loans[msg.sender];
        require(loan.active, "No active loan");
        require(
            msg.value >= loan.installmentAmount,
            "Insufficient installment"
        );
        require(block.timestamp >= loan.nextDueDate, "Too early");

        // Calculate late penalty using tier-specific late fee APR
        uint256 penalty = 0;
        if (block.timestamp > loan.nextDueDate + 7 days) {
            RiskTier tier = getRiskTier(msg.sender);
            uint256 lateFeeAPR = tierFees[uint256(tier)].lateFeeAPR;
            uint256 daysLate = (block.timestamp - (loan.nextDueDate + 7 days)) /
                1 days;
            if (daysLate > 0 && lateFeeAPR > 0) {
                penalty =
                    (loan.outstanding * lateFeeAPR * daysLate) /
                    365 /
                    10000;
                loan.outstanding += penalty;
                emit LoanLatePenaltyApplied(msg.sender, penalty);
            }
        }

        loan.outstanding -= loan.installmentAmount;
        userDebt[msg.sender] -= loan.installmentAmount;
        totalRepaidAllTime += loan.installmentAmount;
        loan.nextDueDate += 30 days;
        emit LoanInstallmentPaid(msg.sender, msg.value, loan.outstanding);
        if (loan.outstanding == 0) {
            loan.active = false;
            emit LoanFullyRepaid(msg.sender);
        }
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

        // --- Late Fee ---
        uint256 lateFee = 0;
        if (reserveAddress != address(0) && borrowTimestamp[msg.sender] > 0) {
            uint256 daysLate = 0;
            if (block.timestamp > borrowTimestamp[msg.sender] + 7 days) {
                daysLate =
                    (block.timestamp - (borrowTimestamp[msg.sender] + 7 days)) /
                    1 days;
            }
            if (daysLate > 0) {
                lateFee =
                    (userDebt[msg.sender] *
                        tierFees[uint256(tier)].lateFeeAPR *
                        daysLate) /
                    365 /
                    10000;
                if (lateFee > 0) {
                    lendingManager.collectLateFee{value: lateFee}(
                        msg.sender,
                        userDebt[msg.sender],
                        uint256(tier),
                        lateFee
                    );
                }
            }
        }
        // --- End Late Fee ---

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

    // Remove setLiquidationThreshold and getLiquidationThreshold functions
    // Remove getMaxBorrowAmount if it only uses LTV logic
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

    // Remove getLiquidationThreshold function
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

    // Remove getMaxBorrowAmount if it only uses LTV logic
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
        // Defensive: prevent division by zero
        require(validBorrowed != 0, "Division by zero in weighted risk score");
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
        // Defensive: prevent division by zero
        require(
            totalBorrowedAllTime != 0,
            "Division by zero in repayment ratio"
        );
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

    // --- Helper for undercollateralization ---
    function isUndercollateralized(address user) public view returns (bool) {
        (bool healthy, ) = checkCollateralization(user);
        return !healthy && userDebt[user] > 0;
    }

    // --- Partial Liquidation ---
    function executePartialLiquidation(
        address user,
        address collateralToken
    ) external noReentrancy whenNotPaused {
        require(isUndercollateralized(user), "Position healthy");
        require(isAllowedCollateral[collateralToken], "Invalid collateral");
        uint256 debt = userDebt[user];
        uint256 price = getTokenValue(collateralToken); // 18 decimals
        uint256 ltv = stablecoinManager.getLTV(collateralToken); // e.g., 75 for 75%
        require(ltv > 0, "LTV not set");
        require(price > 0, "Collateral price is zero");
        uint256 buffer = SAFETY_BUFFER;
        // Collateral to seize = (debt * (100 + buffer)) / (ltv * price/1e18)
        uint256 numerator = debt * (100 + buffer) * 1e18;
        uint256 denominator = ltv * price;
        require(denominator != 0, "Division by zero in partial liquidation");
        uint256 collateralToSeize = numerator / denominator;
        uint256 userBalance = collateralBalance[collateralToken][user];
        if (collateralToSeize > userBalance) collateralToSeize = userBalance;
        require(
            collateralToSeize >= minPartialLiquidationAmount,
            "Below min liquidation"
        );
        // Update state
        collateralBalance[collateralToken][user] -= collateralToSeize;
        userDebt[user] = 0;
        borrowTimestamp[user] = 0;
        isLiquidatable[user] = false;
        liquidationStartTime[user] = 0;
        // Remove all debt from borrowedAmountByRiskTier
        borrowedAmountByRiskTier[getRiskTier(user)] -= debt;
        totalRepaidAllTime += debt;
        // Transfer collateral to liquidator
        IERC20(collateralToken).transfer(msg.sender, collateralToSeize);
        emit PartialLiquidation(
            user,
            msg.sender,
            collateralToken,
            collateralToSeize,
            debt
        );
    }

    // --- Admin functions for new system ---
    function setReserveAddress(address _reserve) external onlyOwner {
        require(_reserve != address(0), "Invalid reserve address");
        reserveAddress = _reserve;
        emit ReserveAddressUpdated(_reserve);
    }

    function setMinPartialLiquidationAmount(uint256 amount) external onlyOwner {
        minPartialLiquidationAmount = amount;
    }

    function setTierFee(
        uint256 tier,
        uint256 originationFee,
        uint256 lateFeeAPR
    ) external onlyOwner {
        require(tier < borrowTierConfigs.length, "Invalid tier");
        tierFees[tier] = TierFee(originationFee, lateFeeAPR);
        emit TierFeeUpdated(tier, originationFee, lateFeeAPR);
    }

    // --- Circuit Breaker (auto-pause) ---
    function checkCircuitBreakers() public {
        // Oracle staleness
        address[] memory tokens = getAllowedCollateralTokens();
        for (uint i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            address feed = priceFeed[token];
            if (feed != address(0)) {
                (, uint256 updatedAt) = _getFreshPrice(token);
                if (block.timestamp - updatedAt > 1 hours) {
                    paused = true;
                    emit EmergencyPaused(true);
                    return;
                }
            }
        }
        // Utilization
        if (
            totalFunds > 0 &&
            ((totalBorrowedAllTime - totalRepaidAllTime) * 100) / totalFunds >
            95
        ) {
            paused = true;
            emit EmergencyPaused(true);
            return;
        }
        // Mass undercollateralization
        uint256 under = 0;
        for (uint i = 0; i < users.length; i++) {
            if (isUndercollateralized(users[i])) under++;
        }
        if (users.length > 0 && (under * 100) / users.length > 5) {
            paused = true;
            emit EmergencyPaused(true);
            return;
        }
    }

    // --- Reporting ---
    function getLoan(address user) external view returns (Loan memory) {
        return loans[user];
    }

    // Get detailed loan information including payment schedule
    function getLoanDetails(
        address user
    )
        external
        view
        returns (
            uint256 principal,
            uint256 outstanding,
            uint256 interestRate,
            uint256 nextDueDate,
            uint256 installmentAmount,
            uint256 penaltyBps,
            bool active,
            uint256 daysUntilDue,
            uint256 latePenaltyIfPaidNow,
            uint256 totalInstallmentsRemaining
        )
    {
        Loan memory loan = loans[user];
        principal = loan.principal;
        outstanding = loan.outstanding;
        interestRate = loan.interestRate;
        nextDueDate = loan.nextDueDate;
        installmentAmount = loan.installmentAmount;
        penaltyBps = loan.penaltyBps;
        active = loan.active;

        // Calculate days until due
        if (block.timestamp < loan.nextDueDate) {
            daysUntilDue = (loan.nextDueDate - block.timestamp) / 1 days;
        } else {
            daysUntilDue = 0;
        }

        // Calculate late penalty if paid now
        latePenaltyIfPaidNow = 0;
        if (block.timestamp > loan.nextDueDate + 7 days && loan.active) {
            RiskTier tier = getRiskTier(user);
            uint256 lateFeeAPR = tierFees[uint256(tier)].lateFeeAPR;
            uint256 daysLate = (block.timestamp - (loan.nextDueDate + 7 days)) /
                1 days;
            if (daysLate > 0 && lateFeeAPR > 0) {
                latePenaltyIfPaidNow =
                    (loan.outstanding * lateFeeAPR * daysLate) /
                    365 /
                    10000;
            }
        }

        // Calculate remaining installments
        if (loan.active && loan.outstanding > 0) {
            totalInstallmentsRemaining =
                (loan.outstanding + loan.installmentAmount - 1) /
                loan.installmentAmount;
        } else {
            totalInstallmentsRemaining = 0;
        }
    }
}
