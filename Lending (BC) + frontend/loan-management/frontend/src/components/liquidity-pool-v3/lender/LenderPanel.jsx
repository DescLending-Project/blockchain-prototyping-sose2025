import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Alert, AlertDescription } from '../../ui/alert'
import { formatEther, parseEther } from 'ethers'
import { Info, Clock } from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../../ui/tooltip"
import { LendingPoolStatus } from '../shared/LendingPoolStatus'

function CountdownTimer({ targetDate, label }) {
    const [timeLeft, setTimeLeft] = useState('')

    useEffect(() => {
        const updateTimer = () => {
            let target;
            if (typeof targetDate === 'bigint') {
                target = new Date(Number(targetDate));
            } else if (typeof targetDate === 'number') {
                target = new Date(targetDate);
            } else if (typeof targetDate === 'string') {
                target = new Date(Number(targetDate));
            } else {
                target = new Date(targetDate);
            }
            const now = new Date()
            const diff = target - now

            if (diff <= 0) {
                setTimeLeft('Ready')
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
    }, [targetDate])

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

    useEffect(() => {
        if (contract && account) {
            loadLenderInfo()
            loadInterestTiers()
            loadWithdrawalStatus()
            checkNetwork()
        }
    }, [contract, account])

    const checkNetwork = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const network = await provider.getNetwork()
            // Set SONIC for all networks since we're using SONIC
            setTokenSymbol('SONIC')
        } catch (err) {
            console.error('Failed to check network:', err)
            setTokenSymbol('SONIC')
        }
    }

    const loadLenderInfo = async () => {
        try {
            const info = await contract.getLenderInfo(account)
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

    const calculatePotentialInterest = async () => {
        try {
            if (!calculatorAmount || !calculatorDays) return
            const amount = parseEther(calculatorAmount)
            const days = parseInt(calculatorDays)
            const interest = await contract.calculatePotentialInterest(amount, days)
            setPotentialInterest(formatEther(interest))
        } catch (err) {
            console.error('Failed to calculate potential interest:', err)
        }
    }

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

    return (
        <div className="space-y-4">
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
                                                <p>{lenderInfo.nextInterestUpdate.toLocaleString()}</p>
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-gray-500">Your Balance</p>
                                    <p className="text-lg font-semibold">{lenderInfo.balance} SONIC</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Pending Interest</p>
                                    <p className="text-lg font-semibold">{lenderInfo.pendingInterest} SONIC</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Earned Interest</p>
                                    <p className="text-lg font-semibold">{lenderInfo.earnedInterest} SONIC</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Next Interest Update</p>
                                    <p className="text-lg font-semibold">{lenderInfo.nextInterestUpdate.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="mt-6">
                                <h3 className="text-lg font-semibold mb-2">Interest Calculator</h3>
                                <div className="grid grid-cols-2 gap-4">
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
                            </div>

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
                                                        • Early withdrawal penalty: {withdrawalStatus.penaltyIfWithdrawnNow} {tokenSymbol}
                                                    </p>
                                                )}
                                                <p>• Next interest distribution: {withdrawalStatus.nextInterestDistribution.toLocaleString()}</p>
                                                <p>• Available interest: {withdrawalStatus.availableInterest} {tokenSymbol}</p>
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
                                                                    Available at: {withdrawalStatus.availableAt.toLocaleString()}
                                                                </p>
                                                                {!withdrawalStatus.isAvailableWithoutPenalty && (
                                                                    <p className="text-sm text-red-500">
                                                                        Early withdrawal penalty: {withdrawalStatus.penaltyIfWithdrawnNow} {tokenSymbol}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-gray-500">Available Interest</p>
                                                        <p className="text-lg font-semibold">{withdrawalStatus.availableInterest} {tokenSymbol}</p>
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
                                                Withdraw Interest ({withdrawalStatus?.availableInterest} {tokenSymbol})
                                            </Button>
                                            <p className="text-sm text-gray-500 text-center">
                                                Interest can be withdrawn at any time without cooldown
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    )
} 