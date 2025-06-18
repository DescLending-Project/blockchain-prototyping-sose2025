// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

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

    // Reference to LiquidityPoolV3
    address public liquidityPool;

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
        currentDailyRate = 1.0001304e18; // ~5% APY daily rate
        lastRateUpdateDay = block.timestamp / SECONDS_PER_DAY;

        // Initialize interest tiers
        interestTiers.push(InterestTier(10 ether, 1.0001500e18)); // 10+ ETH: 5.5% APY
        interestTiers.push(InterestTier(5 ether, 1.0001400e18)); // 5+ ETH: 5.2% APY
        interestTiers.push(InterestTier(1 ether, 1.0001304e18)); // 1+ ETH: 5% APY
    }

    function depositFunds() external payable {
        if (msg.value < MIN_DEPOSIT_AMOUNT) {
            revert("Deposit amount too low");
        }
        if (msg.value + lenders[msg.sender].balance > MAX_DEPOSIT_AMOUNT) {
            revert("Deposit would exceed maximum limit");
        }

        // Forward funds to LiquidityPoolV3
        (bool success, ) = liquidityPool.call{value: msg.value}("");
        require(success, "Failed to forward funds to liquidity pool");

        LenderInfo storage lender = lenders[msg.sender];
        _creditInterest(msg.sender);

        if (lender.balance == 0) {
            lender.interestIndex = _currentInterestIndex();
            lender.depositTimestamp = block.timestamp;
        }

        lender.balance += msg.value;
        totalLent += msg.value;

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

        // Request funds from LiquidityPoolV3
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

        // Request funds from LiquidityPoolV3
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
            uint256 currentIndex = _currentInterestIndex();
            pendingInterest =
                ((balance * currentIndex) / info.interestIndex) -
                balance;
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
        nextInterestDistribution =
            info.lastInterestDistribution +
            SECONDS_PER_DAY;

        if (info.balance > 0) {
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

    function _nextDistributionTime(
        address lender
    ) internal view returns (uint256) {
        LenderInfo memory info = lenders[lender];
        if (info.balance == 0) return 0;
        return info.lastInterestDistribution + SECONDS_PER_DAY;
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

    function setEarlyWithdrawalPenalty(uint256 newPenalty) external onlyOwner {
        require(newPenalty <= 100, "Penalty too high");
        EARLY_WITHDRAWAL_PENALTY = newPenalty;
    }

    function setCurrentDailyRate(uint256 newRate) external onlyOwner {
        require(newRate >= 1e18, "Rate must be >= 1");
        currentDailyRate = newRate;
        lastRateUpdateDay = block.timestamp / SECONDS_PER_DAY;
    }

    // Add receive function to accept ETH
    receive() external payable {}
}
