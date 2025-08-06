// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "./interfaces/AggregatorV3Interface.sol";
import "./StablecoinManager.sol";
import "./LendingManager.sol";
import "./InterestRateModel.sol";
import "./IntegratedCreditSystem.sol";
import "./VotingToken.sol";
import "./NullifierRegistry.sol";

//interface for verifier
interface ICreditScore {
    function getCreditScore(address user) external view returns (
        uint64 score,
        bool isValid,
        uint256 timestamp
    );
}

contract LiquidityPool is
    Initializable,
    AccessControlUpgradeable,
    AutomationCompatibleInterface
{
    /// @notice Allows the timelock (owner) to extract ETH from the pool
    function extract(uint256 amount, address payable to) external onlyTimelock {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "ETH transfer failed");
    }

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
    VotingToken public votingToken;
    NullifierRegistry public nullifierRegistry;


    address public timelock;

    // ZK-Proof Integration
    IntegratedCreditSystem public creditSystem;
    bool public zkProofRequired; // Whether ZK proofs are required for borrowing

    // NEW: RISC0 Credit Score Integration
    ICreditScore public creditScoreContract;
    bool public useRISC0CreditScores; // Toggle for RISC0 vs local scores
    uint256 public constant SCORE_EXPIRY_PERIOD = 90 days; // How long RISC0 scores are valid

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
    event CreditSystemUpdated(
        address indexed oldSystem,
        address indexed newSystem
    );
    event ZKProofRequirementToggled(bool required);
    event ZKProofValidationFailed(address indexed user, string reason);

    // NEW: RISC0 Integration Events
    event CreditScoreContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );
    event RISC0ScoreToggled(bool useRISC0);
    event CreditScoreSourceUsed(
        address indexed user,
        string source,
        uint256 score,
        uint256 convertedScore
    );

    event BorrowWithNullifier(address indexed user, uint256 amount, bytes32 nullifier);


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

    modifier requiresZKProof() {
        if (zkProofRequired && address(creditSystem) != address(0)) {
            require(
                creditSystem.isEligibleToBorrow(msg.sender),
                "ZK proof verification required"
            );
        }
        _;
    }

    modifier onlyTimelock() {
        if (msg.sender != timelock) revert OnlyTimelockLiquidityPool();
        _;
    }

    function initialize(
        address _timelock,
        address _stablecoinManager,
        address _lendingManager,
        address _interestRateModel,
        address _creditSystem,
        address _nullifierRegistry
    ) public initializer {
        __AccessControl_init();
        timelock = _timelock;
        stablecoinManager = StablecoinManager(_stablecoinManager);
        lendingManager = LendingManager(payable(_lendingManager));
        interestRateModel = InterestRateModel(_interestRateModel);
        nullifierRegistry = NullifierRegistry(_nullifierRegistry);

        // Initialize ZK-proof system
        if (_creditSystem != address(0)) {
            creditSystem = IntegratedCreditSystem(_creditSystem);
            zkProofRequired = true; // Enable ZK proof requirement by default
        }

        // NEW: Initialize RISC0 integration
        useRISC0CreditScores = false; // Disabled by default until contract is set

        _initializeRiskTiers();
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

    // NEW: RISC0 Credit Score Integration Functions

    /**
     * @notice Set the RISC0 credit score contract address
     * @param _creditScoreContract Address of the CreditScore contract
     */
    function setCreditScoreContract(address _creditScoreContract) external onlyTimelock {
        address oldContract = address(creditScoreContract);
        creditScoreContract = ICreditScore(_creditScoreContract);
        
        // Auto-enable RISC0 scores if a valid contract is set
        if (_creditScoreContract != address(0)) {
            useRISC0CreditScores = true;
        }
        
        emit CreditScoreContractUpdated(oldContract, _creditScoreContract);
    }

    /**
     * @notice Toggle RISC0 credit score usage
     * @param _useRISC0 Whether to use RISC0 scores
     */
    function toggleRISC0CreditScores(bool _useRISC0) external onlyTimelock {
        useRISC0CreditScores = _useRISC0;
        emit RISC0ScoreToggled(_useRISC0);
    }

    /**
     * @notice Convert FICO score (300-850) to contract score (0-100)
     * @param ficoScore FICO score from RISC0 verification
     * @return Contract score (0-100)
     */
    function convertFICOToContractScore(uint64 ficoScore) public pure returns (uint256) {
        if (ficoScore <= 300) return 0;
        if (ficoScore >= 850) return 100;
        
        // Linear mapping: (FICO - 300) / 550 * 100
        return ((ficoScore - 300) * 100) / 550;
    }

    /**
     * @notice Enhanced credit score retrieval with RISC0 integration
     * @param user Address of the user
     * @return score Credit score (0-100)
     * @return source Source of the credit score
     * @return isVerified Whether the score is RISC0 verified
     */
    function getCreditScoreWithSource(address user) external view returns (
        uint256 score,
        string memory source,
        bool isVerified
    ) {
        // Try RISC0 verified score first
        if (useRISC0CreditScores && address(creditScoreContract) != address(0)) {
            try creditScoreContract.getCreditScore(user) returns (
                uint64 ficoScore,
                bool isValid,
                uint256 timestamp
            ) {
                if (isValid && ficoScore > 0) {
                    // Check if score is not expired
                    if (block.timestamp <= timestamp + SCORE_EXPIRY_PERIOD) {
                        uint256 convertedScore = convertFICOToContractScore(ficoScore);
                        return (convertedScore, "RISC0_VERIFIED", true);
                    }
                }
            } catch {
                // Fall through to next source
            }
        }

        // Try IntegratedCreditSystem
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
                    return (finalScore, "INTEGRATED_SYSTEM", false);
                }
            } catch {
                // Fall through to final source
            }
        }

        // Use local stored score as final fallback
        uint256 localScore = creditScore[user];
        return (localScore, "LOCAL_STORAGE", false);
    }

    /**
     * @notice Internal function to get credit score with RISC0 priority
     * @param user Address of the user
     * @return Credit score (0-100)
     */
    function _getCreditScore(address user) internal view returns (uint256) {
        // Try RISC0 verified score first
        if (useRISC0CreditScores && address(creditScoreContract) != address(0)) {
            try creditScoreContract.getCreditScore(user) returns (
                uint64 ficoScore,
                bool isValid,
                uint256 timestamp
            ) {
                if (isValid && ficoScore > 0) {
                    // Check if score is not expired
                    if (block.timestamp <= timestamp + SCORE_EXPIRY_PERIOD) {
                        return convertFICOToContractScore(ficoScore);
                    }
                }
            } catch {
                // Fall through to existing logic
            }
        }
        
        // Existing fallback logic from your original contract
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

    /**
     * @notice Check if user has a valid RISC0 verified credit score
     * @param user Address of the user
     * @return hasValidScore Whether user has valid RISC0 score
     * @return score The RISC0 verified score
     * @return timestamp When the score was verified
     */
    function hasValidRISC0Score(address user) external view returns (
        bool hasValidScore,
        uint256 score,
        uint256 timestamp
    ) {
        if (!useRISC0CreditScores || address(creditScoreContract) == address(0)) {
            return (false, 0, 0);
        }

        try creditScoreContract.getCreditScore(user) returns (
            uint64 ficoScore,
            bool isValid,
            uint256 scoreTimestamp
        ) {
            if (isValid && ficoScore > 0 && block.timestamp <= scoreTimestamp + SCORE_EXPIRY_PERIOD) {
                return (true, convertFICOToContractScore(ficoScore), scoreTimestamp);
            }
        } catch {
            // Return false if call fails
        }
        
        return (false, 0, 0);
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
                    lendingManager.executeLiquidation(address(this), user);
                }
            }
        }
    }

    // --- DAO Permission IDs ---
    bytes32 public constant SET_ADMIN_PERMISSION =
        keccak256("SET_ADMIN_PERMISSION");
    bytes32 public constant ALLOW_COLLATERAL_PERMISSION =
        keccak256("ALLOW_COLLATERAL_PERMISSION");
    bytes32 public constant UPDATE_BORROW_TIER_PERMISSION =
        keccak256("UPDATE_BORROW_TIER_PERMISSION");
    bytes32 public constant SET_CREDIT_SCORE_PERMISSION =
        keccak256("SET_CREDIT_SCORE_PERMISSION");
    bytes32 public constant SET_PRICE_FEED_PERMISSION =
        keccak256("SET_PRICE_FEED_PERMISSION");
    bytes32 public constant TOGGLE_PAUSE_PERMISSION =
        keccak256("TOGGLE_PAUSE_PERMISSION");
    bytes32 public constant SET_LENDING_MANAGER_PERMISSION =
        keccak256("SET_LENDING_MANAGER_PERMISSION");
    bytes32 public constant SET_MAX_PRICE_AGE_PERMISSION =
        keccak256("SET_MAX_PRICE_AGE_PERMISSION");
    bytes32 public constant SET_RESERVE_ADDRESS_PERMISSION =
        keccak256("SET_RESERVE_ADDRESS_PERMISSION");
    bytes32 public constant SET_MIN_PARTIAL_LIQUIDATION_AMOUNT_PERMISSION =
        keccak256("SET_MIN_PARTIAL_LIQUIDATION_AMOUNT_PERMISSION");
    bytes32 public constant SET_TIER_FEE_PERMISSION =
        keccak256("SET_TIER_FEE_PERMISSION");

    // --- Admin/DAO Functions ---
    function setAdmin(address newAdmin) external onlyTimelock {
        require(newAdmin != address(0), "Invalid address");
        timelock = newAdmin;
    }

    function getAdmin() external view returns (address) {
        return timelock;
    }

    function setAllowedCollateral(
        address token,
        bool allowed
    ) external onlyTimelock {
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
    // Get user's risk tier (UPDATED to use RISC0 scores)
    function getRiskTier(address user) public view returns (RiskTier) {
        uint256 score = _getCreditScore(user); // Now uses RISC0 if available

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
    ) external onlyTimelock {
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
        uint256 amount, bytes32 nullifier
    ) external payable whenNotPaused noReentrancy {
        // 1. Check for existing debt
        require(userDebt[msg.sender] == 0, "Repay your existing debt first");
        require(!nullifierRegistry.isNullifierUsed(nullifier), "Proof already used!");
        require(nullifierRegistry.hasSelectedAccounts(msg.sender), "Select accounts first");
        nullifierRegistry.useNullifier(nullifier, msg.sender);



        // 2. Get credit score (now uses RISC0 if available)
        uint256 userCreditScore = _getCreditScore(msg.sender);
        
        // NEW: Log which credit score source was used
        (uint256 score, string memory source, bool isVerified) = this.getCreditScoreWithSource(msg.sender);
        emit CreditScoreSourceUsed(msg.sender, source, score, userCreditScore);

        // 3. Check for credit score (TIER_5)
        RiskTier tier = getRiskTier(msg.sender);
        require(tier != RiskTier.TIER_5, "Credit score too low");

        // 4. Check for available lending capacity (not more than half the pool)
        require(
            amount <= totalFunds / 2,
            "Borrow amount exceeds available lending capacity"
        );

        // 5. Check for tier limit
        (, , uint256 maxLoanAmount) = getBorrowTerms(msg.sender);
        require(
            amount <= maxLoanAmount,
            "Borrow amount exceeds your tier limit"
        );

        // 6. Check for sufficient collateral
        (uint256 requiredRatio, , ) = getBorrowTerms(msg.sender);
        uint256 collateralValue = getTotalCollateralValue(msg.sender);
        require(
            collateralValue * 100 >= amount * requiredRatio,
            "Insufficient collateral for this loan"
        );

        // 7. Calculate and apply origination fee
        uint256 originationFee = 0;
        if (reserveAddress != address(0)) {
            originationFee =
                (amount * tierFees[uint256(tier)].originationFee) /
                10000;
        }
        uint256 netAmount = amount - originationFee;

        // 8. Transfer origination fee to reserve if applicable
        if (originationFee > 0) {
            payable(reserveAddress).transfer(originationFee);
            emit FeeCollected(
                msg.sender,
                originationFee,
                "origination",
                uint256(tier)
            );
        }

        // 9. Calculate dynamic rate
        uint256 adjustedRate = _calculateBorrowRate(amount, tier);

        // 10. Create loan
        require(amount >= 12, "Loan amount too small for amortization");
        _createLoan(amount, adjustedRate);

        // 11. Update state
        userDebt[msg.sender] = amount;
        borrowTimestamp[msg.sender] = block.timestamp;
        borrowedAmountByRiskTier[tier] += amount;
        totalBorrowedAllTime += amount;

        // 12. Transfer net amount to borrower (after deducting origination fee)
        payable(msg.sender).transfer(netAmount);

        emit LoanDisbursed(msg.sender, amount, adjustedRate);
        emit Borrowed(msg.sender, amount);
        emit BorrowWithNullifier(msg.sender, amount, nullifier);
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

    function repay() external payable whenNotPaused noReentrancy {
        uint256 debt = userDebt[msg.sender];
        require(debt > 0, "No debt to repay");
        require(msg.value > 0, "Must send ETH");

        // State changes BEFORE external calls
        uint256 repayAmount = msg.value > debt ? debt : msg.value;
        userDebt[msg.sender] -= repayAmount;
        totalRepaidAllTime += repayAmount;

        // Update borrowed amount by risk tier
        RiskTier tier = getRiskTier(msg.sender);
        borrowedAmountByRiskTier[tier] -= repayAmount;

        // Clear liquidation status
        if (isLiquidatable[msg.sender]) {
            isLiquidatable[msg.sender] = false;
            liquidationStartTime[msg.sender] = 0;
        }

        // External call after state changes
        if (address(votingToken) != address(0)) {
            votingToken.mint(msg.sender, repayAmount / 1e16);
        }

        // Refund excess
        if (msg.value > debt) {
            payable(msg.sender).transfer(msg.value - debt);
        }

        emit Repaid(msg.sender, repayAmount);
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
    ) external onlyTimelock validAddress(user) {
        require(score <= 100, "Score out of range");
        creditScore[user] = score;
        emit CreditScoreAssigned(user, score);
    }

    /*function _getCreditScore(address user) internal view returns (uint256) {
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
    }*/

    function updateCreditScoreFromZK(address user, uint256 score) external {
        require(
            msg.sender == address(creditSystem),
            "Only credit system can update"
        );
        require(score <= 100, "Score out of range");

        uint256 oldScore = creditScore[user];
        creditScore[user] = score;

        emit CreditScoreAssigned(user, score);
    }

    /// @notice Set the integrated credit system
    /// @param _creditSystem Address of the credit system contract
    function setCreditSystem(address _creditSystem) external onlyTimelock {
        address oldSystem = address(creditSystem);
        creditSystem = IntegratedCreditSystem(_creditSystem);
        emit CreditSystemUpdated(oldSystem, _creditSystem);
    }

    /// @notice Toggle ZK proof requirement for borrowing
    /// @param required Whether ZK proofs are required
    function setZKProofRequirement(bool required) external onlyTimelock {
        zkProofRequired = required;
        emit ZKProofRequirementToggled(required);
    }

    function getZKVerificationStatus(
        address user
    )
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

    function setPriceFeed(address token, address feed) external onlyTimelock {
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

    // Add a public function to check if a user can lend (has a nonzero credit score)
    function canLend(address user) public view returns (bool) {
        //return creditScore[user] > 0;
        return _getCreditScore(user) > 0;  // Now uses RISC0/ZK/local priority
        
    }

    receive() external payable {
        totalFunds += msg.value;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function togglePause() external onlyTimelock {
        paused = !paused;
        emit EmergencyPaused(paused);
    }

    function isPaused() external view returns (bool) {
        return paused;
    }

    function setLiquidator(address _liquidator) external onlyTimelock {
        liquidator = _liquidator;
    }

    // Remove getMaxBorrowAmount if it only uses LTV logic
    function setLendingManager(address _lendingManager) external onlyTimelock {
        require(
            _lendingManager != address(0),
            "Invalid lending manager address"
        );
        lendingManager = LendingManager(payable(_lendingManager));
    }

    // --- Throttling for automation ---
    uint256 public lastUpkeep;
    uint256 public constant UPKEEP_COOLDOWN = 60; // 1 min

    function setMaxPriceAge(address token, uint256 age) external onlyTimelock {
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
    /*function isOracleHealthy(address token) public view returns (bool) {
        address feedAddress = priceFeed[token];
        if (feedAddress == address(0)) return false;
        AggregatorV3Interface pf = AggregatorV3Interface(feedAddress);
        (uint80 roundId, , , uint256 updatedAt, uint80 answeredInRound) = pf
            .latestRoundData();
        if (block.timestamp - updatedAt > _getMaxPriceAge(token)) return false;
        if (answeredInRound < roundId) return false;
        return true;
    }*/

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

    // --- Admin functions for new system ---
    function setReserveAddress(address _reserve) external onlyTimelock {
        require(_reserve != address(0), "Invalid reserve address");
        reserveAddress = _reserve;
        emit ReserveAddressUpdated(_reserve);
    }

    function setMinPartialLiquidationAmount(
        uint256 amount
    ) external onlyTimelock {
        minPartialLiquidationAmount = amount;
    }

    function setVotingToken(address _votingToken) external onlyTimelock {
        votingToken = VotingToken(_votingToken);
    }

    function setTierFee(
        uint256 tier,
        uint256 originationFee,
        uint256 lateFeeAPR
    ) external onlyTimelock {
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
            if (lendingManager.isUndercollateralized(address(this), users[i]))
                under++;
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

    // SIZE CONCERN
    // Get detailed loan information including payment schedule
    /*function getLoanDetails(
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
    }*/

    // --- Interface hooks for LendingManager ---
    function clearCollateral(
        address token,
        address user,
        address to,
        uint256 amount
    ) external {
        require(msg.sender == address(lendingManager), "Only LendingManager");
        collateralBalance[token][user] -= amount;
        IERC20(token).transfer(to, amount);
    }

    function clearDebt(address user, uint256 amount) external {
        require(msg.sender == address(lendingManager), "Only LendingManager");
        userDebt[user] = 0;
        borrowTimestamp[user] = 0;
        isLiquidatable[user] = false;
        liquidationStartTime[user] = 0;
        // Remove all debt from borrowedAmountByRiskTier
        borrowedAmountByRiskTier[getRiskTier(user)] -= amount;
        totalRepaidAllTime += amount;
    }

    function withdrawPartialCollateral(
        address token,
        uint256 amount
    ) external whenNotPaused noReentrancy {
        require(amount > 0, "Amount must be > 0");
        require(
            collateralBalance[token][msg.sender] >= amount,
            "Insufficient collateral"
        );

        // Check if user has debt
        uint256 debt = userDebt[msg.sender];
        if (debt > 0) {
            // Calculate remaining collateral value after withdrawal
            uint256 remainingBalance = collateralBalance[token][msg.sender] -
                amount;
            uint256 remainingCollateralValue = (remainingBalance *
                getTokenValue(token)) / 1e18;

            // Get user's current risk tier and corresponding collateral requirements
            RiskTier tier = getRiskTier(msg.sender);
            (uint256 requiredRatio, , ) = getBorrowTerms(msg.sender);

            // Calculate minimum collateral needed based on tier
            uint256 minCollateralValue = (debt * requiredRatio) / 100;

            // Apply dynamic collateral reduction based on risk tier
            uint256 adjustedMinCollateral = _getAdjustedCollateralRequirement(
                minCollateralValue,
                tier,
                msg.sender
            );

            require(
                remainingCollateralValue >= adjustedMinCollateral,
                "Withdrawal would violate tier-based collateral requirements"
            );
        }

        collateralBalance[token][msg.sender] -= amount;
        IERC20(token).transfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, token, amount);
    }

    function getCreditScore(address user) external view returns (uint256) {
        return _getCreditScore(user);
    }

    // Dynamic collateral requirement adjustment based on risk tier and credit improvements
    function _getAdjustedCollateralRequirement(
        uint256 baseRequirement,
        RiskTier tier,
        address user
    ) internal view returns (uint256) {
        uint256 creditScore = _getCreditScore(user);

        // Base tier collateral ratios (from borrowTierConfigs)
        uint256 tierCollateralRatio = borrowTierConfigs[uint256(tier)]
            .collateralRatio;

        // Apply credit score bonuses based on tier
        if (tier == RiskTier.TIER_1) {
            // Tier 1 (90-100 score): Already lowest ratio, minimal additional reduction
            if (creditScore >= 95) {
                return (baseRequirement * 95) / 100; // 5% reduction
            }
        } else if (tier == RiskTier.TIER_2) {
            // Tier 2 (80-89 score): More significant reductions possible
            if (creditScore >= 85) {
                return (baseRequirement * 90) / 100; // 10% reduction
            } else if (creditScore >= 82) {
                return (baseRequirement * 95) / 100; // 5% reduction
            }
        } else if (tier == RiskTier.TIER_3) {
            // Tier 3 (70-79 score): Substantial reductions for improvement
            if (creditScore >= 75) {
                return (baseRequirement * 85) / 100; // 15% reduction
            } else if (creditScore >= 72) {
                return (baseRequirement * 92) / 100; // 8% reduction
            }
        } else if (tier == RiskTier.TIER_4) {
            // Tier 4 (60-69 score): Largest potential reductions
            if (creditScore >= 65) {
                return (baseRequirement * 80) / 100; // 20% reduction
            } else if (creditScore >= 62) {
                return (baseRequirement * 90) / 100; // 10% reduction
            }
        }
        // TIER_5 users can't borrow, so no adjustment needed

        return baseRequirement; // No reduction if criteria not met
    }

    // SIZE CONCERN

    // View function to check potential collateral reduction for a user
    /*function getCollateralReductionInfo(
        address user
    )
        external
        view
        returns (
            RiskTier currentTier,
            uint256 currentCollateralRatio,
            uint256 adjustedCollateralRatio,
            uint256 potentialReductionPercent
        )
    {
        currentTier = getRiskTier(user);
        (currentCollateralRatio, , ) = getBorrowTerms(user);

        uint256 debt = userDebt[user];
        if (debt > 0) {
            uint256 baseRequirement = (debt * currentCollateralRatio) / 100;
            uint256 adjustedRequirement = _getAdjustedCollateralRequirement(
                baseRequirement,
                currentTier,
                user
            );

            adjustedCollateralRatio = (adjustedRequirement * 100) / debt;
            potentialReductionPercent = currentCollateralRatio >
                adjustedCollateralRatio
                ? currentCollateralRatio - adjustedCollateralRatio
                : 0;
        } else {
            adjustedCollateralRatio = currentCollateralRatio;
            potentialReductionPercent = 0;
        }
    }
    // SIZE CONCERN
    // Enhanced function to check maximum withdrawable collateral
    /*function getMaxWithdrawableCollateral(
        address user,
        address token
    ) external view returns (uint256 maxWithdrawable) {
        uint256 currentBalance = collateralBalance[token][user];
        uint256 debt = userDebt[user];

        if (debt == 0) {
            return currentBalance; // Can withdraw all if no debt
        }

        uint256 tokenValue = getTokenValue(token);
        uint256 currentCollateralValue = (currentBalance * tokenValue) / 1e18;

        // Get adjusted minimum collateral requirement
        RiskTier tier = getRiskTier(user);
        (uint256 requiredRatio, , ) = getBorrowTerms(user);
        uint256 baseRequirement = (debt * requiredRatio) / 100;
        uint256 adjustedMinCollateral = _getAdjustedCollateralRequirement(
            baseRequirement,
            tier,
            user
        );

        if (currentCollateralValue <= adjustedMinCollateral) {
            return 0; // Cannot withdraw anything
        }

        uint256 excessValue = currentCollateralValue - adjustedMinCollateral;
        maxWithdrawable = (excessValue * 1e18) / tokenValue;

        // Ensure we don't exceed actual balance
        if (maxWithdrawable > currentBalance) {
            maxWithdrawable = currentBalance;
        }
    }*/
}

error OnlyTimelockLiquidityPool();
