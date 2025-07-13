// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LiquidityPool.sol";
import "./InterestRateModel.sol";

// Minimal interfaces for external calls
interface ILiquidityPool {
    function totalBorrowedAllTime() external view returns (uint256);

    function totalRepaidAllTime() external view returns (uint256);

    function interestRateModel() external view returns (address);

    function getGlobalRiskMultiplier() external view returns (uint256);
}

interface IInterestRateModel {
    function getCurrentRates(
        uint256 totalBorrowed,
        uint256 totalSupplied
    ) external view returns (uint256, uint256);

    function getBorrowRate(uint256 utilization) external view returns (uint256);

    function getSupplyRate(
        uint256 utilization,
        uint256 borrowRate
    ) external view returns (uint256);
}

contract LendingManager is Ownable {
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

    struct InterestTier {
        uint256 minAmount;
        uint256 rate;
    }

    mapping(address => LenderInfo) public lenders;
    uint256 public totalLent;
    uint256 public currentDailyRate;
    uint256 public lastRateUpdateDay;
    mapping(uint256 => uint256) public dailyInterestRate;
    InterestTier[] public interestTiers;

    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant WITHDRAWAL_COOLDOWN = 1 days;
    uint256 public EARLY_WITHDRAWAL_PENALTY;
    uint256 public constant MIN_DEPOSIT_AMOUNT = 0.01 ether;
    uint256 public constant MAX_DEPOSIT_AMOUNT = 100 ether;

    // Reference to LiquidityPool
    address public liquidityPool;
    address public reserveAddress;

    // Fee parameters (in basis points, e.g. 100 = 1%)
    uint256 public originationFee; // e.g. 100 = 1%
    uint256 public lateFee; // e.g. 500 = 5%

    event FeeCollected(
        address indexed user,
        uint256 amount,
        string feeType,
        uint256 tier
    );
    event ReserveAddressUpdated(address indexed newReserve);
    event FeeParametersUpdated(uint256 originationFee, uint256 lateFee);

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

    constructor(
        address initialOwner,
        address _liquidityPool
    ) Ownable(initialOwner) {
        liquidityPool = _liquidityPool;
        EARLY_WITHDRAWAL_PENALTY = 5; // 5% penalty
        currentDailyRate = 1000130400000000000; // 1.0001304e18 ~5% APY daily rate
        lastRateUpdateDay = block.timestamp / SECONDS_PER_DAY;

        // Initialize interest tiers
        interestTiers.push(InterestTier(10 ether, 1.0001500e18)); // 10+ ETH: 5.5% APY
        interestTiers.push(InterestTier(5 ether, 1.0001400e18)); // 5+ ETH: 5.2% APY
        interestTiers.push(InterestTier(1 ether, 1.0001304e18)); // 1+ ETH: 5% APY
    }

    function depositFunds() external payable {
        require(msg.value >= MIN_DEPOSIT_AMOUNT, "Deposit too low");
        require(
            msg.value + lenders[msg.sender].balance <= MAX_DEPOSIT_AMOUNT,
            "Deposit would exceed maximum limit"
        );

        LenderInfo storage lender = lenders[msg.sender];

        // Initialize interest index if first deposit
        if (lender.interestIndex == 0) {
            lender.interestIndex = 1e18; // Initialize to 1.0
            lender.depositTimestamp = block.timestamp;
            lender.lastInterestUpdate = block.timestamp;
        }

        _creditInterest(msg.sender);
        lender.balance += msg.value;
        totalLent += msg.value;

        (bool success, ) = liquidityPool.call{value: msg.value}("");
        require(success, "Deposit failed");

        emit FundsDeposited(msg.sender, msg.value);
    }

    function requestWithdrawal(uint256 amount) external {
        LenderInfo storage lender = lenders[msg.sender];
        if (block.timestamp < lender.lastWithdrawalTime + WITHDRAWAL_COOLDOWN) {
            revert("Must wait for cooldown period");
        }
        if (amount > lender.balance) {
            revert("Insufficient balance");
        }
        // Defensive: ensure interestIndex is set
        if (lender.interestIndex == 0) {
            lender.interestIndex = _currentInterestIndex();
        }
        _creditInterest(msg.sender);
        lender.pendingPrincipalWithdrawal = amount;
        lender.withdrawalRequestTime = block.timestamp;
        lender.lastWithdrawalTime = block.timestamp;

        emit WithdrawalRequested(
            msg.sender,
            amount,
            block.timestamp + WITHDRAWAL_COOLDOWN
        );
    }

    function completeWithdrawal() external {
        LenderInfo storage lender = lenders[msg.sender];
        if (lender.pendingPrincipalWithdrawal == 0) {
            revert("No pending withdrawal");
        }

        // Credit interest before withdrawal
        _creditInterest(msg.sender);

        uint256 amount = lender.pendingPrincipalWithdrawal;
        uint256 penalty = 0;

        if (block.timestamp < lender.depositTimestamp + WITHDRAWAL_COOLDOWN) {
            penalty = (amount * EARLY_WITHDRAWAL_PENALTY) / 100;
            amount -= penalty;
            emit EarlyWithdrawalPenalty(msg.sender, penalty);
        }

        lender.balance -= amount + penalty;
        totalLent -= amount + penalty;
        lender.pendingPrincipalWithdrawal = 0;

        // Request funds from LiquidityPool
        (bool success, ) = liquidityPool.call(
            abi.encodeWithSignature(
                "withdrawForLendingManager(uint256)",
                amount
            )
        );
        require(success, "Failed to extract funds from liquidity pool");

        payable(msg.sender).transfer(amount);
        emit FundsWithdrawn(msg.sender, amount, penalty);
    }

    function claimInterest() external {
        LenderInfo storage lender = lenders[msg.sender];
        if (lender.balance == 0) {
            revert("No funds deposited");
        }

        _creditInterest(msg.sender);
        uint256 interest = lender.earnedInterest;
        if (interest == 0) {
            revert("No interest to claim");
        }

        lender.earnedInterest = 0;
        totalLent -= interest;

        // Request funds from LiquidityPool
        (bool success, ) = liquidityPool.call(
            abi.encodeWithSignature(
                "withdrawForLendingManager(uint256)",
                interest
            )
        );
        require(success, "Failed to extract funds from liquidity pool");

        payable(msg.sender).transfer(interest);
        emit InterestClaimed(msg.sender, interest);
    }

    function cancelPrincipalWithdrawal() external {
        LenderInfo storage lender = lenders[msg.sender];
        if (lender.pendingPrincipalWithdrawal == 0) {
            revert("No pending withdrawal to cancel");
        }

        uint256 amount = lender.pendingPrincipalWithdrawal;
        lender.pendingPrincipalWithdrawal = 0;
        lender.withdrawalRequestTime = 0;

        emit WithdrawalCancelled(msg.sender, amount);
    }

    function getLenderInfo(
        address lender
    )
        external
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
            require(info.interestIndex != 0, "interestIndex must not be zero");
            uint256 currentIndex = _currentInterestIndex();
            // Safe interest calculation using scaling
            uint256 scaledBalance = balance * 1e18;
            uint256 ratio = (currentIndex * 1e18) / info.interestIndex;
            pendingInterest = (scaledBalance * ratio) / 1e36;

            // Safely subtract balance only if pendingInterest > balance
            if (pendingInterest > balance) {
                pendingInterest -= balance;
            } else {
                pendingInterest = 0;
            }
        }

        nextInterestUpdate = _nextDistributionTime(lender);
    }

    function getWithdrawalStatus(
        address lender
    )
        external
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

        penaltyIfWithdrawnNow = block.timestamp < availableAt
            ? (info.balance * EARLY_WITHDRAWAL_PENALTY) / 100
            : 0;

        isAvailableWithoutPenalty = block.timestamp >= availableAt;

        // If lastInterestDistribution is 0, use current block timestamp
        uint256 nextTime;
        if (info.lastInterestDistribution == 0) {
            nextTime = block.timestamp + SECONDS_PER_DAY;
        } else {
            nextTime = info.lastInterestDistribution + SECONDS_PER_DAY;
        }

        // Clamp: if nextTime is more than 2 days in the future, reset to 1 day from now
        if (nextTime > block.timestamp + 2 * SECONDS_PER_DAY) {
            nextInterestDistribution = block.timestamp + SECONDS_PER_DAY;
        } else {
            nextInterestDistribution = nextTime;
        }

        if (info.balance > 0) {
            require(info.interestIndex != 0, "interestIndex must not be zero");
            uint256 currentIndex = _currentInterestIndex();
            availableInterest =
                ((info.balance * currentIndex) / info.interestIndex) -
                info.balance;
        }
    }

    function calculateInterest(
        address lender
    ) external view returns (uint256 interest) {
        LenderInfo memory info = lenders[lender];
        if (info.balance == 0) return 0;
        require(info.interestIndex != 0, "interestIndex must not be zero");
        uint256 currentIndex = _currentInterestIndex();
        // Safe calculation
        uint256 scaledBalance = info.balance * 1e18;
        uint256 ratio = (currentIndex * 1e18) / info.interestIndex;
        interest = (scaledBalance * ratio) / 1e36 - info.balance;

        uint256 daysElapsed = (block.timestamp - info.lastInterestUpdate) /
            SECONDS_PER_DAY;

        if (daysElapsed > 0) {
            for (uint256 i = 0; i < daysElapsed; i++) {
                interest = (interest * currentIndex) / 1e18;
            }
        }
        return interest;
    }

    function calculatePotentialInterest(
        uint256 amount,
        uint256 numDays
    ) external view returns (uint256) {
        uint256 currentIndex = _currentInterestIndex();
        if (currentIndex == 0) {
            // Defensive: treat as 1e18
            currentIndex = 1e18;
        }
        uint256 potentialIndex = currentIndex;

        for (uint256 i = 0; i < numDays; i++) {
            potentialIndex = (potentialIndex * currentDailyRate) / 1e18;
        }

        return ((amount * potentialIndex) / currentIndex) - amount;
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
        require(info.interestIndex != 0, "interestIndex must not be zero");
        uint256 currentIndex = _currentInterestIndex();
        // Safe calculation using scaling
        uint256 scaledBalance = info.balance * 1e18;
        uint256 ratio = (currentIndex * 1e18) / info.interestIndex;
        uint256 interest = (scaledBalance * ratio) / 1e36;

        return interest > info.balance ? interest - info.balance : 0;
    }

    function canCompleteWithdrawal(
        address lender
    ) external view returns (bool) {
        LenderInfo memory info = lenders[lender];
        if (info.pendingPrincipalWithdrawal == 0) return false;
        return
            block.timestamp >= info.withdrawalRequestTime + WITHDRAWAL_COOLDOWN;
    }

    function getInterestRate(uint256 amount) public view returns (uint256) {
        return _getInterestRate(amount);
    }

    // --- Dynamic Supply Rate Integration ---
    function getDynamicSupplyRate() public view returns (uint256) {
        uint256 totalSupplied = totalLent;
        if (totalSupplied == 0) return currentDailyRate; // Use currentDailyRate if no supply
        uint256 totalBorrowed = ILiquidityPool(address(uint160(liquidityPool)))
            .totalBorrowedAllTime() -
            ILiquidityPool(address(uint160(liquidityPool)))
                .totalRepaidAllTime();
        if (totalBorrowed == 0) return currentDailyRate; // Use currentDailyRate if no borrows
        uint256 utilization = (totalBorrowed * 1e18) / totalSupplied;
        (, uint256 supplyRate) = IInterestRateModel(
            address(
                uint160(
                    ILiquidityPool(address(uint160(liquidityPool)))
                        .interestRateModel()
                )
            )
        ).getCurrentRates(totalBorrowed, totalSupplied);
        return supplyRate;
    }

    // Get dynamic lender rate based on utilization and global risk multiplier
    function getLenderRate() public view returns (uint256) {
        uint256 totalSupplied = totalLent;
        uint256 totalBorrowed = ILiquidityPool(liquidityPool)
            .totalBorrowedAllTime() -
            ILiquidityPool(liquidityPool).totalRepaidAllTime();
        if (totalSupplied == 0) return currentDailyRate;
        uint256 utilization = (totalBorrowed * 1e18) / totalSupplied;
        uint256 borrowRate = IInterestRateModel(
            ILiquidityPool(liquidityPool).interestRateModel()
        ).getBorrowRate(utilization);
        uint256 supplyRate = IInterestRateModel(
            ILiquidityPool(liquidityPool).interestRateModel()
        ).getSupplyRate(utilization, borrowRate);
        uint256 globalMult = ILiquidityPool(liquidityPool)
            .getGlobalRiskMultiplier();
        return (supplyRate * globalMult) / 1e18;
    }

    // --- Real-Time Return Rate for Lender (View) ---
    function getRealTimeReturnRate(
        address lender
    ) external view returns (uint256) {
        require(liquidityPool != address(0), "LiquidityPool not set");
        uint256 dynamicRate = getLenderRate(); // Use dynamic rate instead of baseLenderAPR
        return dynamicRate;
    }

    // --- Base APR for Lender (stub, replace with real logic) ---
    function baseLenderAPR(address lender) public pure returns (uint256) {
        // TODO: Replace with actual calculation
        // For now, return 6% APR (0.06e18)
        return 6e16;
    }

    // --- Borrower Rate (View, for future use) ---
    function getBorrowerRate(uint256 tier) public view returns (uint256) {
        require(liquidityPool != address(0), "LiquidityPool not set");
        // Example: use base rate per tier (not implemented here), apply global multiplier
        // uint256 baseRate = baseBorrowRateByTier[tier];
        // return (baseRate * ILiquidityPool(liquidityPool).getGlobalRiskMultiplier()) / 1e18;
        return 0; // Placeholder
    }

    // Internal functions
    function _getInterestRate(uint256 amount) internal view returns (uint256) {
        for (uint i = interestTiers.length; i > 0; i--) {
            if (amount >= interestTiers[i - 1].minAmount) {
                return interestTiers[i - 1].rate;
            }
        }
        return currentDailyRate;
    }

    function _currentInterestIndex() internal view returns (uint256) {
        if (totalLent == 0) return 1e18;

        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 daysElapsed = currentDay - lastRateUpdateDay;
        uint256 supplyRate = getDynamicSupplyRate();

        if (daysElapsed == 0) return supplyRate;

        // Safe exponential calculation with bounds checking
        uint256 index = supplyRate;
        for (uint256 i = 0; i < daysElapsed; i++) {
            uint256 newIndex = (index * supplyRate) / 1e18;
            if (newIndex < index) {
                // Check for overflow
                return type(uint256).max / 1e18; // Return maximum safe value
            }
            index = newIndex;
        }
        return index;
    }

    function _creditInterest(address lender) internal {
        LenderInfo storage info = lenders[lender];
        // Early return if no balance
        if (info.balance == 0) return;

        // Defensive: initialize interestIndex if zero
        if (info.interestIndex == 0) {
            info.interestIndex = 1e18;
            info.lastInterestUpdate = block.timestamp;
            return;
        }

        uint256 currentIndex = _currentInterestIndex();
        if (currentIndex == 0) {
            // Defensive: do not accrue interest if index is zero
            return;
        }
        uint256 interest = ((info.balance * currentIndex) /
            info.interestIndex) - info.balance;

        // Only calculate interest if current index is greater than last index
        if (currentIndex > info.interestIndex) {
            // Safe calculation using scaling to prevent overflow
            uint256 scaledBalance = info.balance * 1e18; // Scale up
            uint256 ratio = (currentIndex * 1e18) / info.interestIndex; // Get ratio
            interest = (scaledBalance * ratio) / 1e36 - info.balance; // Scale down and subtract principal

            // Apply interest if positive
            if (interest > 0) {
                info.earnedInterest += interest;
                info.balance += interest;
                totalLent += interest;
                info.lastInterestDistribution = block.timestamp;
                emit InterestCredited(lender, interest);
            }
        }

        // Update indices
        info.interestIndex = currentIndex;
        info.lastInterestUpdate = block.timestamp;
    }

    function _nextDistributionTime(
        address lender
    ) internal view returns (uint256) {
        LenderInfo memory info = lenders[lender];
        if (info.balance == 0) return 0;

        uint256 nextTime;
        // If lastInterestDistribution is 0, use current block timestamp
        if (info.lastInterestDistribution == 0) {
            nextTime = block.timestamp + SECONDS_PER_DAY;
        } else {
            nextTime = info.lastInterestDistribution + SECONDS_PER_DAY;
        }

        // Clamp: if nextTime is more than 2 days in the future, reset to 1 day from now
        if (nextTime > block.timestamp + 2 * SECONDS_PER_DAY) {
            return block.timestamp + SECONDS_PER_DAY;
        }

        return nextTime;
    }

    // --- Reporting ---
    event LenderInterestAccrued(
        address indexed lender,
        uint256 interest,
        uint256 rate
    );

    function getLenderReport(
        address lender
    ) external view returns (LenderInfo memory) {
        return lenders[lender];
    }

    // Admin functions
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

    function setFeeParameters(
        uint256 _originationFee,
        uint256 _lateFee
    ) external onlyOwner {
        require(_originationFee <= 10000 && _lateFee <= 10000, "Fee too high"); // max 100%
        originationFee = _originationFee;
        lateFee = _lateFee;
        emit FeeParametersUpdated(_originationFee, _lateFee);
    }

    function setEarlyWithdrawalPenalty(uint256 newPenalty) external onlyOwner {
        require(newPenalty <= 100, "Penalty too high");
        EARLY_WITHDRAWAL_PENALTY = newPenalty;
    }

    function setCurrentDailyRate(uint256 newRate) external onlyOwner {
        require(newRate >= 1e18, "Rate must be >= 1");
        currentDailyRate = newRate;
        lastRateUpdateDay = block.timestamp / SECONDS_PER_DAY;
    }

    function setReserveAddress(address _reserve) external onlyOwner {
        require(_reserve != address(0), "Invalid reserve address");
        reserveAddress = _reserve;
        emit ReserveAddressUpdated(_reserve);
    }

    function collectOriginationFee(
        address user,
        uint256 amount,
        uint256 tier,
        uint256 fee
    ) external payable {
        require(msg.sender == liquidityPool, "Only pool");
        if (fee > 0) {
            require(msg.value >= fee, "Insufficient fee payment");
            payable(reserveAddress).transfer(fee);
            emit FeeCollected(user, fee, "origination", tier);
        }
    }

    function collectLateFee(
        address user,
        uint256 amount,
        uint256 tier,
        uint256 fee
    ) external payable {
        require(msg.sender == liquidityPool, "Only pool");
        if (fee > 0) {
            require(msg.value >= fee, "Insufficient fee payment");
            payable(reserveAddress).transfer(fee);
            emit FeeCollected(user, fee, "late", tier);
        }
    }

    // Add receive function to accept ETH
    receive() external payable {}
}
