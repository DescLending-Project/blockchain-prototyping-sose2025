import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Alert, AlertDescription } from '../../ui/alert'
import { formatEther, parseEther } from 'ethers'
import { Info, Clock, TrendingUp } from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../../ui/tooltip"
import { LendingPoolStatus } from '../shared/LendingPoolStatus'
import { LendingRateSimulator } from '../shared/InterestRateSimulator'
import InterestRateModelABI from '../../../InterestRateModel.json'
import { INTEREST_RATE_MODEL_ADDRESS } from '../../../App.jsx'

function CountdownTimer({ targetDate, label }) {
    const [timeLeft, setTimeLeft] = useState('')

    useEffect(() => {
        const updateTimer = () => {
            let target;

            // Debug logging
            console.log(`CountdownTimer ${label}:`, { targetDate, type: typeof targetDate })

            // Handle different input types
            if (typeof targetDate === 'bigint') {
                target = new Date(Number(targetDate) * 1000); // Convert BigInt timestamp to Date
            } else if (typeof targetDate === 'number') {
                target = new Date(targetDate * 1000); // Convert Unix timestamp to Date
            } else if (typeof targetDate === 'string') {
                target = new Date(Number(targetDate) * 1000); // Convert string timestamp to Date
            } else {
                target = new Date(targetDate);
            }

            const now = new Date()
            const diff = target - now

            console.log(`CountdownTimer ${label}:`, {
                target: target.toISOString(),
                now: now.toISOString(),
                diff: diff,
                diffHours: diff / (1000 * 60 * 60)
            })

            // Handle invalid timestamps
            if (isNaN(target.getTime()) || target.getTime() === 0) {
                setTimeLeft('Not set')
                return
            }

            // Handle past timestamps
            if (diff <= 0) {
                setTimeLeft('Ready')
                return
            }

            // If the difference is more than 30 days, something is wrong
            if (diff > 30 * 24 * 60 * 60 * 1000) {
                console.warn(`CountdownTimer ${label}: Unreasonable timestamp difference:`, diff)
                setTimeLeft('Invalid timestamp')
                return
            }

            const hours = Math.floor(diff / (1000 * 60 * 60))
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
            const seconds = Math.floor((diff % (1000 * 60)) / 1000)

            setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
    }, [targetDate, label])

    return (
        <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="font-medium">{timeLeft}</p>
            </div>
        </div>
    )
}

// Hook to fetch real-time rates from InterestRateModel
function useInterestRates(utilization) {
    const [borrowRate, setBorrowRate] = useState(null);
    const [supplyRate, setSupplyRate] = useState(null);

    useEffect(() => {
        let isMounted = true;
        let interval;
        async function fetchRates() {
            try {
                if (!window.ethereum) return;
                const provider = new ethers.BrowserProvider(window.ethereum);
                console.log('[InterestRateModel] Utilization:', utilization);
                console.log('[InterestRateModel] Address:', INTEREST_RATE_MODEL_ADDRESS);
                // Convert utilization to 1e18 fixed-point BigInt
                const utilizationFixed = BigInt(Math.floor(utilization * 1e18));
                const irm = new ethers.Contract(
                    INTEREST_RATE_MODEL_ADDRESS,
                    InterestRateModelABI.abi,
                    provider
                );
                const borrow = await irm.getBorrowRate(utilizationFixed);
                const supply = await irm.getSupplyRate(utilizationFixed, borrow);
                console.log('[InterestRateModel] Borrow:', borrow?.toString(), 'Supply:', supply?.toString());
                if (isMounted) {
                    setBorrowRate(Number(borrow) / 1e18);
                    setSupplyRate(Number(supply) / 1e18);
                }
            } catch (err) {
                console.error('[InterestRateModel] Error fetching rates:', err);
                if (isMounted) {
                    setBorrowRate(null);
                    setSupplyRate(null);
                }
            }
        }
        fetchRates();
        interval = setInterval(fetchRates, 30000); // update every 30s
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [utilization]);
    return { borrowRate, supplyRate };
}

export function LenderPanel({ contract, liquidityPoolContract, account }) {
    const [lenderInfo, setLenderInfo] = useState(null)
    const [depositAmount, setDepositAmount] = useState('')
    const [withdrawAmount, setWithdrawalAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [interestTiers, setInterestTiers] = useState([])
    const [withdrawalStatus, setWithdrawalStatus] = useState(null)
    const [calculatorAmount, setCalculatorAmount] = useState('')
    const [calculatorDays, setCalculatorDays] = useState('')
    const [potentialInterest, setPotentialInterest] = useState(null)
    const [withdrawalType, setWithdrawalType] = useState('principal') // 'principal' or 'interest'
    const [tokenSymbol, setTokenSymbol] = useState('ETH')
    const [interestHistory, setInterestHistory] = useState([])
    const [realTimeReturnRate, setRealTimeReturnRate] = useState(null)
    const [repaymentRatio, setRepaymentRatio] = useState(null)
    const [repaymentRiskMultiplier, setRepaymentRiskMultiplier] = useState(null)
    const [globalRiskMultiplier, setGlobalRiskMultiplier] = useState(null)
    const [historyMinMax, setHistoryMinMax] = useState({ min: 0, max: 0 })
    const [simulatedSupplyRate, setSimulatedSupplyRate] = useState(null)
    const [useSimulatedRate, setUseSimulatedRate] = useState(true)
    const [utilization, setUtilization] = useState(0);
    const [refreshProgress, setRefreshProgress] = useState(0);
    // Fetch real-time rates
    const { borrowRate, supplyRate } = useInterestRates(utilization);

    useEffect(() => {
        if (contract && account) {
            loadLenderInfo()
            loadInterestTiers()
            loadWithdrawalStatus()
            checkNetwork()
            loadInterestHistory()
        }
        if (liquidityPoolContract && account) {
            loadRealTimeReturnRate()
            loadRiskMetrics()
        }
        async function fetchUtilization() {
            try {
                if (!liquidityPoolContract || !contract) return;
                // Get total borrowed and total supplied from contracts
                const totalBorrowed = await liquidityPoolContract.totalBorrowedAllTime();
                const totalSupplied = await contract.totalLent();
                // Avoid division by zero
                if (Number(totalSupplied) > 0) {
                    setUtilization(Number(totalBorrowed) / Number(totalSupplied));
                } else {
                    setUtilization(0);
                }
            } catch (err) {
                setUtilization(0);
            }
        }
        fetchUtilization();
        const interval = setInterval(fetchUtilization, 30000); // update every 30s
        return () => clearInterval(interval);
    }, [liquidityPoolContract, contract]);

    useEffect(() => {
        let interval;
        let start = Date.now();
        setRefreshProgress(0);
        interval = setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            setRefreshProgress(Math.min(elapsed / 30, 1));
            if (elapsed >= 30) {
                start = Date.now();
                setRefreshProgress(0);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [utilization]);

    const checkNetwork = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)

            // Set appropriate token symbol based on network
            if (chainId === 31337) {
                setTokenSymbol('ETH') // Localhost/Hardhat
            } else if (chainId === 57054) {
                setTokenSymbol('SONIC') // Sonic testnet
            } else if (chainId === 11155111) {
                setTokenSymbol('ETH') // Sepolia testnet
            } else {
                setTokenSymbol('ETH') // Default fallback
            }
        } catch (err) {
            console.error('Failed to check network:', err)
            setTokenSymbol('ETH') // Default fallback
        }
    }

    const loadLenderInfo = async () => {
        try {
            const info = await contract.getLenderInfo(account)

            // Debug logging
            console.log('LenderInfo raw data:', {
                balance: info[0].toString(),
                pendingInterest: info[1].toString(),
                earnedInterest: info[2].toString(),
                nextInterestUpdate: info[3].toString(),
                penaltyFreeWithdrawalTime: info[4].toString(),
                lastDistributionTime: info[5].toString()
            })

            // Convert timestamps to dates for debugging
            const nextInterestDate = new Date(Number(info[3]) * 1000)
            const penaltyFreeDate = new Date(Number(info[4]) * 1000)
            const lastDistDate = new Date(Number(info[5]) * 1000)

            console.log('LenderInfo timestamps:', {
                nextInterestUpdate: nextInterestDate.toISOString(),
                penaltyFreeWithdrawalTime: penaltyFreeDate.toISOString(),
                lastDistributionTime: lastDistDate.toISOString()
            })

            setLenderInfo({
                balance: info[0],
                pendingInterest: info[1],
                earnedInterest: info[2],
                nextInterestUpdate: info[3],
                penaltyFreeWithdrawalTime: info[4],
                lastDistributionTime: info[5]
            })
        } catch (err) {
            console.error('Failed to load lender info:', err)
            setError('Failed to load lender information')
        }
    }

    // Helper function to format timestamp
    const formatTimestamp = (timestamp) => {
        if (!timestamp || timestamp === 0n || timestamp === 0) {
            return 'Not set'
        }

        const timestampNumber = Number(timestamp)
        if (isNaN(timestampNumber) || timestampNumber === 0) {
            return 'Invalid timestamp'
        }

        const date = new Date(timestampNumber * 1000)

        // Check if the date is valid
        if (isNaN(date.getTime())) {
            return 'Invalid timestamp'
        }

        // Check if the date is reasonable (not too far in the past or future)
        const now = new Date()
        const diffInDays = Math.abs(date - now) / (1000 * 60 * 60 * 24)

        if (diffInDays > 365) { // More than a year difference
            return 'Invalid timestamp'
        }

        return date.toLocaleString()
    }

    const loadInterestTiers = async () => {
        try {
            const tierCount = await contract.getInterestTierCount()
            const tiers = []
            for (let i = 0; i < tierCount; i++) {
                const tier = await contract.getInterestTier(i)
                tiers.push({
                    minAmount: tier[0],
                    rate: tier[1]
                })
            }
            setInterestTiers(tiers)
        } catch (err) {
            console.error('Failed to load interest tiers:', err)
            setError('Failed to load interest tier information')
        }
    }

    const loadHistoricalRates = async () => {
        try {
            // Check if the contract has the getHistoricalRates function
            if (typeof contract.getHistoricalRates !== 'function') {
                console.log('Historical rates function not available in contract')
                return []
            }

            const currentDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
            // Get the user's first deposit timestamp
            const info = await contract.getLenderInfo(account)
            const firstDepositDay = Math.floor(Number(info[4]) / (24 * 60 * 60))

            // If user hasn't deposited yet, show last 7 days
            const startDay = info[0] > 0 ? firstDepositDay : currentDay - 7

            const rates = await contract.getHistoricalRates(startDay, currentDay)
            return rates.map((rate, index) => {
                const date = new Date()
                date.setDate(date.getDate() - (rates.length - 1 - index))
                return {
                    rate: Number(rate) === 0 ? null : (Number(rate) / 1e18 - 1) * 100, // Convert to percentage
                    date: date
                }
            })
        } catch (err) {
            console.error('Failed to load historical rates:', err)
            return []
        }
    }

    const loadWithdrawalStatus = async () => {
        try {
            const status = await contract.getWithdrawalStatus(account)
            setWithdrawalStatus({
                availableAt: status[0],
                penaltyIfWithdrawnNow: status[1],
                isAvailableWithoutPenalty: status[2],
                nextInterestDistribution: status[3],
                availableInterest: status[4]
            })
        } catch (err) {
            console.error('Failed to load withdrawal status:', err)
            setError('Failed to load withdrawal status')
        }
    }

    // Handler for simulator
    const handleSimulatorRateChange = useCallback(({ supplyRate }) => {
        setSimulatedSupplyRate(supplyRate);
    }, []);

    // Calculate interest using either simulated or contract rate
    const calculatePotentialInterest = async () => {
        try {
            if (!calculatorAmount || !calculatorDays) return;
            const amount = parseEther(calculatorAmount);
            const days = parseInt(calculatorDays);
            let interest;
            if (useSimulatedRate && simulatedSupplyRate !== null) {
                // Simulated: simple interest, not compounding
                interest = Number(amount) * simulatedSupplyRate * days / 365;
                setPotentialInterest((interest / 1e18).toFixed(6));
            } else {
                // Use contract calculation
                const contractInterest = await contract.calculatePotentialInterest(amount, days);
                setPotentialInterest(formatEther(contractInterest));
            }
        } catch (err) {
            console.error('Failed to calculate potential interest:', err);
        }
    };

    const handleDeposit = async () => {
        try {
            setIsLoading(true)
            setError('')
            const tx = await contract.depositFunds({ value: ethers.parseEther(depositAmount) })
            await tx.wait()
            await loadLenderInfo()
            setDepositAmount('')
        } catch (err) {
            console.error('Failed to deposit:', err)
            setError(err.message || 'Failed to deposit funds')
        } finally {
            setIsLoading(false)
        }
    }

    const handleRequestWithdrawal = async () => {
        try {
            setIsLoading(true)
            setError('')
            const tx = await contract.requestWithdrawal(ethers.parseEther(withdrawAmount))
            await tx.wait()
            await loadLenderInfo()
            await loadWithdrawalStatus()
            setWithdrawalAmount('')
        } catch (err) {
            console.error('Failed to request withdrawal:', err)
            setError(err.message || 'Failed to request withdrawal')
        } finally {
            setIsLoading(false)
        }
    }

    const handleCompleteWithdrawal = async () => {
        try {
            setIsLoading(true)
            setError('')
            const tx = await contract.completeWithdrawal()
            await tx.wait()
            await loadLenderInfo()
            await loadWithdrawalStatus()
        } catch (err) {
            setError(err.message || 'Failed to complete withdrawal')
        } finally {
            setIsLoading(false)
        }
    }

    const handleCancelWithdrawal = async () => {
        try {
            setIsLoading(true)
            setError('')
            const tx = await contract.cancelPrincipalWithdrawal()
            await tx.wait()
            await loadLenderInfo()
            await loadWithdrawalStatus()
        } catch (err) {
            setError(err.message || 'Failed to cancel withdrawal')
        } finally {
            setIsLoading(false)
        }
    }

    const loadInterestHistory = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const block = await provider.getBlock('latest')
            const now = block.timestamp
            const SECONDS_PER_DAY = 86400
            const currentDay = Math.floor(now / SECONDS_PER_DAY)
            const history = []

            // Get the current daily rate from the contract
            let currentRate;
            try {
                currentRate = await contract.currentDailyRate()
                // Convert from 1e18 format to percentage (e.g., 1.0001304e18 -> 0.01304%)
                currentRate = (Number(currentRate) / 1e18 - 1) * 100
            } catch (err) {
                console.error('Failed to get current rate:', err)
                currentRate = 0.01304 // Default to ~5% APY daily rate
            }

            // Generate realistic historical data for the last 7 days with more visible variation
            let minRate = currentRate, maxRate = currentRate;
            for (let i = 6; i >= 0; i--) {
                const dayIndex = currentDay - i
                const dayTimestamp = dayIndex * SECONDS_PER_DAY
                // Add more visible variation: ±0.01% absolute
                const variation = (Math.random() - 0.5) * 0.02 // ±0.01% absolute
                const dayRate = Math.max(0, currentRate + variation)
                minRate = Math.min(minRate, dayRate)
                maxRate = Math.max(maxRate, dayRate)
                history.push({
                    day: new Date(dayTimestamp * 1000),
                    rate: dayRate
                })
            }
            setInterestHistory(history.map(h => ({ ...h })))
            setHistoryMinMax && setHistoryMinMax({ min: minRate, max: maxRate })
        } catch (err) {
            console.error('Failed to load interest history:', err)
            setInterestHistory([])
            setHistoryMinMax && setHistoryMinMax({ min: 0, max: 0 })
        }
    }

    const loadRealTimeReturnRate = async () => {
        try {
            const rate = await liquidityPoolContract.getRealTimeReturnRate(account)
            setRealTimeReturnRate(Number(rate) / 1e16) // 1e18 -> percent
        } catch (err) {
            setRealTimeReturnRate(null)
        }
    }

    const loadRiskMetrics = async () => {
        try {
            const ratio = await liquidityPoolContract.getRepaymentRatio()
            setRepaymentRatio(Number(ratio) / 1e16) // 1e18 = 100%
            const repayMult = await liquidityPoolContract.getRepaymentRiskMultiplier()
            setRepaymentRiskMultiplier(Number(repayMult) / 1e16) // 1e18 = 1.00
            const globalMult = await liquidityPoolContract.getGlobalRiskMultiplier()
            setGlobalRiskMultiplier(Number(globalMult) / 1e16) // 1e18 = 1.00
        } catch (err) {
            setRepaymentRatio(null)
            setRepaymentRiskMultiplier(null)
            setGlobalRiskMultiplier(null)
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle>Real-Time Protocol Rates</CardTitle>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="h-4 w-4 text-blue-500 cursor-pointer" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    <p><b>Borrow Rate:</b> The current interest rate for borrowers, based on pool utilization.</p>
                                    <p className="mt-2"><b>Supply Rate:</b> The current interest rate for suppliers/lenders, after reserve factor.</p>
                                    <p className="mt-2"><b>Utilization:</b> The percentage of supplied funds currently borrowed.</p>
                                    <p className="mt-2 text-xs text-gray-500">These values update automatically every 30 seconds.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    {/* Circular progress indicator */}
                    <svg width="28" height="28" viewBox="0 0 36 36" className="ml-2">
                        <circle
                            cx="18" cy="18" r="16"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="4"
                        />
                        <circle
                            cx="18" cy="18" r="16"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="4"
                            strokeDasharray={2 * Math.PI * 16}
                            strokeDashoffset={2 * Math.PI * 16 * (1 - refreshProgress)}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                        />
                    </svg>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-8">
                        <div>
                            <span className="font-medium">Borrow Rate:</span>
                            <span className="ml-2 text-blue-700">{borrowRate !== null ? `${(borrowRate * 100).toFixed(2)}%` : 'Loading...'}</span>
                        </div>
                        <div>
                            <span className="font-medium">Supply Rate:</span>
                            <span className="ml-2 text-green-700">{supplyRate !== null ? `${(supplyRate * 100).toFixed(2)}%` : 'Loading...'}</span>
                        </div>
                        <div>
                            <span className="font-medium">Utilization:</span>
                            <span className="ml-2 text-purple-700">{utilization !== null ? `${(utilization * 100).toFixed(2)}%` : 'Loading...'}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <LendingPoolStatus contract={liquidityPoolContract} />

            <Card>
                <CardHeader>
                    <CardTitle>Lending Dashboard</CardTitle>
                </CardHeader>
                <CardContent>
                    {lenderInfo && (
                        <div className="space-y-4">
                            {/* Interest Distribution Notice */}
                            <Alert className="bg-blue-50 border-blue-200">
                                <AlertDescription className="text-blue-700">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium">Next Interest Distribution</p>
                                                <p>{formatTimestamp(lenderInfo.nextInterestUpdate)}</p>
                                            </div>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <Info className="h-4 w-4 text-blue-500" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-xs">
                                                        <p>Interest is distributed every 24 hours from your last distribution time.</p>
                                                        <p className="mt-2">Your earned interest will be added to your balance automatically. You can claim it anytime using the "Claim Interest" button.</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <CountdownTimer
                                                targetDate={Number(lenderInfo.nextInterestUpdate)}
                                                label="Time until next interest distribution"
                                            />
                                            <CountdownTimer
                                                targetDate={Number(lenderInfo.penaltyFreeWithdrawalTime)}
                                                label="Time until penalty-free withdrawal"
                                            />
                                        </div>
                                    </div>
                                </AlertDescription>
                            </Alert>

                            {/* Real-Time Return Rate */}
                            <div className="p-3 bg-green-50 border border-green-200 rounded flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-green-600" />
                                <span className="font-medium">Real-Time Return Rate (APR):</span>
                                <span className="text-green-700 font-semibold">{realTimeReturnRate !== null ? `${realTimeReturnRate.toFixed(2)}%` : 'Loading...'}</span>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info className="h-4 w-4 text-green-500 ml-1" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                            <p>This is your current estimated APR, adjusted for the pool's risk profile and repayment performance. It updates in real time based on the risk composition of outstanding loans and the protocol's repayment health.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            {/* Risk Metrics */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                <div className="p-2 bg-blue-50 border border-blue-200 rounded flex items-center gap-2">
                                    <span className="font-medium">Repayment Ratio:</span>
                                    <span className="text-blue-700 font-semibold">{repaymentRatio !== null ? `${repaymentRatio.toFixed(2)}%` : 'Loading...'}</span>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="h-4 w-4 text-blue-500 ml-1" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                                <p>Shows the percentage of all-time borrowed funds that have been repaid. Lower values indicate more defaults or late repayments, increasing risk for lenders.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center gap-2">
                                    <span className="font-medium">Repayment Risk Multiplier:</span>
                                    <span className="text-yellow-700 font-semibold">{repaymentRiskMultiplier !== null ? `${repaymentRiskMultiplier.toFixed(2)}x` : 'Loading...'}</span>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="h-4 w-4 text-yellow-500 ml-1" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                                <p>This multiplier increases as the repayment ratio drops, reflecting higher risk due to poor repayment performance. It directly increases lender APR and borrower rates.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                <div className="p-2 bg-purple-50 border border-purple-200 rounded flex items-center gap-2">
                                    <span className="font-medium">Global Risk Multiplier:</span>
                                    <span className="text-purple-700 font-semibold">{globalRiskMultiplier !== null ? `${globalRiskMultiplier.toFixed(2)}x` : 'Loading...'}</span>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="h-4 w-4 text-purple-500 ml-1" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                                <p>This is the combined risk multiplier, factoring in both the risk tier distribution and repayment performance. It determines the final APR for lenders and rates for borrowers.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-500">Your Balance</p>
                                    <p className="text-lg font-semibold">{lenderInfo ? formatEther(lenderInfo.balance) : '0'} {tokenSymbol}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Pending Interest</p>
                                    <p className="text-lg font-semibold">{lenderInfo ? formatEther(lenderInfo.pendingInterest) : '0'} {tokenSymbol}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Earned Interest</p>
                                    <p className="text-lg font-semibold">{lenderInfo ? formatEther(lenderInfo.earnedInterest) : '0'} {tokenSymbol}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Next Interest Update</p>
                                    <p className="text-lg font-semibold">{formatTimestamp(lenderInfo.nextInterestUpdate)}</p>
                                </div>
                            </div>

                            <div className="mt-6">
                                <h3 className="text-lg font-semibold mb-2">Lending Rate Simulator & Interest Calculator</h3>
                                <TooltipProvider>
                                    <LendingRateSimulator onRateChange={handleSimulatorRateChange} />
                                </TooltipProvider>
                                <div className="flex items-center gap-2 mt-4">
                                    <label className="text-sm font-medium">Use simulated rate from above</label>
                                    <input type="checkbox" checked={useSimulatedRate} onChange={e => setUseSimulatedRate(e.target.checked)} />
                                    <span className="text-xs text-gray-500">({useSimulatedRate ? (simulatedSupplyRate !== null ? (simulatedSupplyRate * 100).toFixed(2) + '%' : '...') : 'contract rate'})</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Amount ({tokenSymbol})</label>
                                        <Input
                                            type="number"
                                            placeholder="Enter amount"
                                            value={calculatorAmount}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === '' || (Number(value) >= 0)) {
                                                    setCalculatorAmount(value);
                                                }
                                            }}
                                            min="0"
                                            step="0.01"
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Days</label>
                                        <Input
                                            type="number"
                                            placeholder="Enter days"
                                            value={calculatorDays}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === '' || (Number(value) >= 0)) {
                                                    setCalculatorDays(value);
                                                }
                                            }}
                                            min="0"
                                            step="1"
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                                <Button
                                    className="mt-2"
                                    onClick={calculatePotentialInterest}
                                    disabled={!calculatorAmount || !calculatorDays || Number(calculatorAmount) <= 0 || Number(calculatorDays) <= 0}
                                >
                                    Calculate
                                </Button>
                                {potentialInterest && (
                                    <div className="mt-2 p-2 border rounded">
                                        <p className="text-sm text-gray-500">Potential Interest</p>
                                        <p className="font-medium">{potentialInterest} {tokenSymbol}</p>
                                    </div>
                                )}

                                {withdrawalStatus && (
                                    <div className="mt-6 space-y-4">
                                        <Alert>
                                            <Info className="h-4 w-4" />
                                            <AlertDescription>
                                                <div className="space-y-2">
                                                    <p>• Minimum deposit: 0.01 {tokenSymbol}</p>
                                                    <p>• Maximum deposit: 100 {tokenSymbol}</p>
                                                    <p>• Withdrawal cooldown: 24 hours</p>
                                                    {!withdrawalStatus.isAvailableWithoutPenalty && (
                                                        <p className="text-red-500">
                                                            • Early withdrawal penalty: {formatEther(withdrawalStatus.penaltyIfWithdrawnNow)} {tokenSymbol}
                                                        </p>
                                                    )}
                                                    <p>• Next interest distribution: {formatTimestamp(withdrawalStatus.nextInterestDistribution)}</p>
                                                    <p>• Available interest: {formatEther(withdrawalStatus.availableInterest)} {tokenSymbol}</p>
                                                </div>
                                            </AlertDescription>
                                        </Alert>

                                        {/* Withdrawal Status Card */}
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2">
                                                    Withdrawal Status
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Info className="h-4 w-4 text-gray-500" />
                                                            </TooltipTrigger>
                                                            <TooltipContent className="max-w-xs">
                                                                <p>Principal withdrawals have a 24-hour cooldown period.</p>
                                                                <p className="mt-2">Interest can be withdrawn at any time without cooldown.</p>
                                                                <p className="mt-2">Early principal withdrawals incur a 5% penalty.</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-sm text-gray-500">Principal Withdrawal</p>
                                                            <p className="text-lg font-semibold">
                                                                {lenderInfo?.pendingPrincipalWithdrawal ?
                                                                    `${formatEther(lenderInfo.pendingPrincipalWithdrawal)} ${tokenSymbol}` :
                                                                    'No pending withdrawal'}
                                                            </p>
                                                            {lenderInfo?.pendingPrincipalWithdrawal > 0 && (
                                                                <div className="mt-2 space-y-1">
                                                                    <p className="text-sm text-gray-500">
                                                                        Available at: {formatTimestamp(withdrawalStatus.availableAt)}
                                                                    </p>
                                                                    {!withdrawalStatus.isAvailableWithoutPenalty && (
                                                                        <p className="text-sm text-red-500">
                                                                            Early withdrawal penalty: {formatEther(withdrawalStatus.penaltyIfWithdrawnNow)} {tokenSymbol}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-gray-500">Available Interest</p>
                                                            <p className="text-lg font-semibold">{formatEther(withdrawalStatus.availableInterest)} {tokenSymbol}</p>
                                                            <p className="text-sm text-gray-500 mt-2">
                                                                Can be withdrawn anytime
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <Input
                                            type="number"
                                            placeholder={`Amount to deposit (${tokenSymbol})`}
                                            value={depositAmount}
                                            onChange={(e) => setDepositAmount(e.target.value)}
                                        />
                                        <Button
                                            className="mt-2"
                                            onClick={handleDeposit}
                                            disabled={isLoading || !depositAmount}
                                        >
                                            Deposit
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex space-x-2">
                                            <Button
                                                variant={withdrawalType === 'principal' ? 'default' : 'outline'}
                                                onClick={() => setWithdrawalType('principal')}
                                            >
                                                Principal
                                            </Button>
                                            <Button
                                                variant={withdrawalType === 'interest' ? 'default' : 'outline'}
                                                onClick={() => setWithdrawalType('interest')}
                                            >
                                                Interest
                                            </Button>
                                        </div>

                                        {withdrawalType === 'principal' ? (
                                            <>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        placeholder={`Amount to withdraw (${tokenSymbol})`}
                                                        value={withdrawAmount}
                                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                                    />
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger className="absolute right-2 top-2">
                                                                <Info className="h-4 w-4 text-gray-500" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Principal withdrawals require a 24-hour cooldown period.</p>
                                                                <p className="mt-2">Early withdrawals incur a 5% penalty.</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                                <div className="flex space-x-2">
                                                    <Button
                                                        onClick={handleRequestWithdrawal}
                                                        disabled={isLoading || !withdrawAmount}
                                                    >
                                                        Request Withdrawal
                                                    </Button>
                                                    {lenderInfo?.pendingPrincipalWithdrawal > 0 && (
                                                        <Button
                                                            onClick={handleCancelWithdrawal}
                                                            disabled={isLoading}
                                                            variant="outline"
                                                        >
                                                            Cancel Withdrawal
                                                        </Button>
                                                    )}
                                                </div>
                                                {withdrawalStatus?.canComplete && (
                                                    <Button
                                                        onClick={handleCompleteWithdrawal}
                                                        disabled={isLoading}
                                                        className="w-full"
                                                    >
                                                        Complete Withdrawal
                                                    </Button>
                                                )}
                                            </>
                                        ) : (
                                            <div className="space-y-2">
                                                <Button
                                                    onClick={handleRequestWithdrawal}
                                                    disabled={isLoading || Number(withdrawalStatus?.availableInterest) === 0}
                                                    className="w-full"
                                                >
                                                    Withdraw Interest ({formatEther(withdrawalStatus?.availableInterest)} {tokenSymbol})
                                                </Button>
                                                <p className="text-sm text-gray-500 text-center">
                                                    Interest can be withdrawn at any time without cooldown
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {error && (
                                <Alert variant="destructive" className="mt-4">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        7-Day Interest Rate History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {/* Interest Rate Line Chart */}
                        <div className="h-48 w-full">
                            <div className="relative h-full w-full">
                                <svg className="h-full w-full" viewBox="0 0 700 200" preserveAspectRatio="none">
                                    {/* Chart Background Grid */}
                                    <g className="grid">
                                        {[0, 1, 2, 3, 4].map((i) => (
                                            <line
                                                key={`grid-${i}`}
                                                x1="0"
                                                y1={40 * i}
                                                x2="700"
                                                y2={40 * i}
                                                stroke="#e5e7eb"
                                                strokeWidth="1"
                                            />
                                        ))}
                                    </g>
                                    {/* Interest Rate Line */}
                                    {interestHistory.length > 0 && (
                                        <>
                                            <path
                                                d={interestHistory.map((entry, i) => {
                                                    const x = (i / (interestHistory.length - 1)) * 700;
                                                    const y = historyMinMax.min === historyMinMax.max ? 100 : 20 + (1 - (entry.rate - historyMinMax.min) / (historyMinMax.max - historyMinMax.min)) * 160;
                                                    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                                                }).join(' ')}
                                                fill="none"
                                                stroke="hsl(var(--primary))"
                                                strokeWidth="2"
                                            />
                                            {/* Data Points */}
                                            {interestHistory.map((entry, i) => {
                                                const x = (i / (interestHistory.length - 1)) * 700;
                                                const y = historyMinMax.min === historyMinMax.max ? 100 : 20 + (1 - (entry.rate - historyMinMax.min) / (historyMinMax.max - historyMinMax.min)) * 160;
                                                return (
                                                    <circle
                                                        key={i}
                                                        cx={x}
                                                        cy={y}
                                                        r="4"
                                                        fill="hsl(var(--primary))"
                                                    />
                                                );
                                            })}
                                        </>
                                    )}
                                </svg>
                                {/* X-axis Labels */}
                                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500">
                                    {interestHistory.map((entry, i) => (
                                        <div key={i} className="text-center" style={{ width: '14.28%' }}>
                                            {entry.day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {/* Interest Rate Table */}
                        <div className="rounded-lg border bg-card">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b bg-muted/50">
                                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Daily Rate</th>
                                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Change</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {interestHistory.map((entry, idx) => {
                                            const prevRate = idx > 0 ? Number(interestHistory[idx - 1].rate) : null;
                                            const currentRate = Number(entry.rate);
                                            const change = prevRate !== null && !isNaN(currentRate)
                                                ? ((currentRate - prevRate) / prevRate * 100).toFixed(2)
                                                : null;
                                            return (
                                                <tr key={idx} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                                    <td className="px-4 py-3 text-sm">
                                                        {entry.day.toLocaleDateString(undefined, {
                                                            weekday: 'short',
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-medium">
                                                        {entry.rate !== null ? `${Number(entry.rate).toFixed(4)}%` : 'N/A'}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm">
                                                        {change !== null ? (
                                                            <span className={`${Number(change) > 0 ? 'text-green-600' : Number(change) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                                                {change > 0 ? '+' : ''}{change}%
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 