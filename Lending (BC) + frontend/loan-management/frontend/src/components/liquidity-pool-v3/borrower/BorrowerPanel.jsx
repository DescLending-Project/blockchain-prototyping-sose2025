import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Alert, AlertDescription } from '../../ui/alert'
import { formatEther, parseEther } from 'ethers'
import { ArrowUpDown, AlertCircle, Coins } from 'lucide-react'
import { LendingPoolStatus } from '../shared/LendingPoolStatus'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { COLLATERAL_TOKENS } from '../../../App'

export default function BorrowerPanel({ contract, account }) {
    const [userInfo, setUserInfo] = useState(null)
    const [borrowAmount, setBorrowAmount] = useState('')
    const [repayAmount, setRepayAmount] = useState('')
    const [depositAmount, setDepositAmount] = useState('')
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [tokenSymbol, setTokenSymbol] = useState('ETH')
    const [currentValues, setCurrentValues] = useState(null)
    const [collateralTokens, setCollateralTokens] = useState([])
    const [selectedCollateral, setSelectedCollateral] = useState(null)
    const [collateralPrices, setCollateralPrices] = useState({})

    useEffect(() => {
        if (contract && account) {
            loadUserInfo()
            loadCurrentValues()
            loadCollateralTokens()
            checkNetwork()
        }
    }, [contract, account])

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

    const loadCurrentValues = async () => {
        try {
            const creditScore = await contract.getCreditScore(account)
            const collateralValue = await contract.getTotalCollateralValue(account)
            const existingDebt = await contract.getMyDebt()
            const totalFunds = await contract.getBalance()
            const maxBorrowAmount = totalFunds / 2n // 50% of total pool

            setCurrentValues({
                creditScore: creditScore.toString(),
                collateralValue: formatEther(collateralValue),
                existingDebt: formatEther(existingDebt),
                maxBorrowAmount: formatEther(maxBorrowAmount)
            })
        } catch (err) {
            console.error('Failed to load current values:', err)
        }
    }

    const loadCollateralTokens = async () => {
        try {
            const tokens = await contract.getAllowedCollateralTokens()
            setCollateralTokens(tokens)
            if (tokens.length > 0) {
                setSelectedCollateral(tokens[0])
                await loadCollateralPrices(tokens)
            }
        } catch (err) {
            console.error('Failed to load collateral tokens:', err)
        }
    }

    const loadCollateralPrices = async (tokens) => {
        try {
            const prices = {}
            for (const token of tokens) {
                const price = await contract.getTokenValue(token)
                prices[token] = formatEther(price)
            }
            setCollateralPrices(prices)
        } catch (err) {
            console.error('Failed to load collateral prices:', err)
        }
    }

    const handleCollateralChange = async (tokenAddress) => {
        setSelectedCollateral(tokenAddress)
        // Refresh collateral value for the selected token
        await loadCurrentValues()
    }

    const handleBorrow = async () => {
        try {
            setIsLoading(true)
            setError('')
            const tx = await contract.borrow(parseEther(borrowAmount))
            await tx.wait()
            await loadUserInfo()
            await loadCurrentValues()
            setBorrowAmount('')
        } catch (err) {
            setError(err.message || 'Failed to borrow')
        } finally {
            setIsLoading(false)
        }
    }

    const handleRepay = async () => {
        try {
            setIsLoading(true)
            setError('')
            const tx = await contract.repay({ value: parseEther(repayAmount) })
            await tx.wait()
            await loadUserInfo()
            await loadCurrentValues()
            setRepayAmount('')
        } catch (err) {
            setError(err.message || 'Failed to repay')
        } finally {
            setIsLoading(false)
        }
    }

    const handleDepositCollateral = async () => {
        try {
            setIsLoading(true)
            setError('')

            // Get the signer
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()

            // Create ERC20 contract instance for the selected token with signer
            const tokenContract = new ethers.Contract(
                selectedCollateral,
                ['function approve(address spender, uint256 amount) public returns (bool)'],
                signer
            )

            // Approve the liquidity pool to spend tokens
            const approveTx = await tokenContract.approve(contract.target, parseEther(depositAmount))
            await approveTx.wait()

            // Create contract instance with signer for deposit
            const contractWithSigner = contract.connect(signer)

            // Now deposit the collateral
            const tx = await contractWithSigner.depositCollateral(selectedCollateral, parseEther(depositAmount))
            await tx.wait()
            await loadCurrentValues()
            setDepositAmount('')
        } catch (err) {
            setError(err.message || 'Failed to deposit collateral')
        } finally {
            setIsLoading(false)
        }
    }

    const handleWithdrawCollateral = async () => {
        try {
            setIsLoading(true)
            setError('')
            const tx = await contract.withdrawCollateral(selectedCollateral, parseEther(withdrawAmount))
            await tx.wait()
            await loadCurrentValues()
            setWithdrawAmount('')
        } catch (err) {
            setError(err.message || 'Failed to withdraw collateral')
        } finally {
            setIsLoading(false)
        }
    }

    const loadUserInfo = async () => {
        try {
            const debt = await contract.getMyDebt()
            setUserInfo({
                debt: formatEther(debt)
            })
        } catch (err) {
            console.error('Failed to load user info:', err)
        }
    }

    return (
        <div className="space-y-4">
            <LendingPoolStatus contract={contract} />

            {/* Collateral Management Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Collateral Management
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-6">
                    {currentValues && (
                        <Alert className="bg-blue-50 border-blue-200">
                            <AlertDescription className="text-blue-700">
                                <div className="space-y-2">
                                    <p className="font-medium">Your Collateral Position:</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Current Collateral: {currentValues.collateralValue} {
                                            COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === selectedCollateral?.toLowerCase())?.symbol || 'Token'
                                        }</li>
                                        <li>Collateral Value in {tokenSymbol}: {currentValues.collateralValueInSonic} {tokenSymbol}</li>
                                        <li>Required Collateral Ratio: 130% of borrow amount</li>
                                    </ul>
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Select
                                value={selectedCollateral}
                                onValueChange={handleCollateralChange}
                            >
                                <SelectTrigger className="w-[180px] flex items-center justify-between">
                                    <SelectValue placeholder="Select collateral" />
                                    <span className="text-gray-500">▼</span>
                                </SelectTrigger>
                                <SelectContent>
                                    {collateralTokens.map((token) => {
                                        const tokenInfo = COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === token.toLowerCase());
                                        if (!tokenInfo) return null;
                                        return (
                                            <SelectItem key={token} value={token}>
                                                {tokenInfo.symbol} {tokenInfo.isStablecoin && '(Stablecoin)'} (${collateralPrices[token]})
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                placeholder={`Enter amount to deposit (${COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === selectedCollateral?.toLowerCase())?.symbol || 'Token'
                                    })`}
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                min="0"
                                step="0.01"
                                className="w-full"
                            />
                            <Button
                                onClick={handleDepositCollateral}
                                disabled={isLoading || !depositAmount}
                                className="h-10"
                            >
                                Deposit
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                placeholder={`Enter amount to withdraw (${COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === selectedCollateral?.toLowerCase())?.symbol || 'Token'
                                    })`}
                                value={withdrawAmount}
                                onChange={(e) => setWithdrawAmount(e.target.value)}
                                min="0"
                                step="0.01"
                                className="w-full"
                            />
                            <Button
                                onClick={handleWithdrawCollateral}
                                disabled={isLoading || !withdrawAmount || Number(currentValues?.existingDebt) > 0}
                                className="h-10"
                            >
                                Withdraw
                            </Button>
                        </div>

                        {Number(currentValues?.existingDebt) > 0 && (
                            <Alert className="bg-yellow-50 border-yellow-200">
                                <AlertCircle className="h-4 w-4 text-yellow-500" />
                                <AlertDescription className="text-yellow-700">
                                    You cannot withdraw collateral while you have an active debt. Please repay your debt first.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Existing Borrow Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ArrowUpDown className="h-5 w-5" />
                        Borrow
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-6">
                    {currentValues && (
                        <Alert className="bg-blue-50 border-blue-200">
                            <AlertDescription className="text-blue-700">
                                <div className="space-y-2">
                                    <p className="font-medium">Your Current Position:</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Health Status: <span className="text-green-600 font-semibold">Healthy</span></li>
                                        <li>Your Credit Score: {currentValues.creditScore}/100 (Minimum: 60)</li>
                                        <li>Your Collateral Value: {currentValues.collateralValue} {tokenSymbol}</li>
                                        <li className="font-semibold">Your Current Debt: {currentValues.existingDebt} {tokenSymbol}</li>
                                        <li>Required Collateral Ratio: 130% of borrow amount</li>
                                        <li>Maximum Borrow Amount: {currentValues.maxBorrowAmount} {tokenSymbol} (50% of total pool)</li>
                                    </ul>
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                placeholder={`Enter amount to borrow (${tokenSymbol})`}
                                value={borrowAmount}
                                onChange={(e) => setBorrowAmount(e.target.value)}
                                min="0"
                                step="0.01"
                                className="w-full"
                            />
                            <Button
                                onClick={handleBorrow}
                                disabled={isLoading || !borrowAmount || Number(currentValues?.existingDebt) > 0}
                                className="h-10"
                            >
                                Borrow
                            </Button>
                        </div>

                        {Number(currentValues?.existingDebt) > 0 && (
                            <div className="space-y-2">
                                <Alert className="bg-yellow-50 border-yellow-200">
                                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                                    <AlertDescription className="text-yellow-700">
                                        You have an existing debt of {currentValues.existingDebt} {tokenSymbol}. Please repay it before borrowing more.
                                    </AlertDescription>
                                </Alert>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder={`Enter amount to repay (${tokenSymbol})`}
                                        value={repayAmount}
                                        onChange={(e) => setRepayAmount(e.target.value)}
                                        min="0"
                                        step="0.01"
                                        className="w-full"
                                    />
                                    <Button
                                        onClick={handleRepay}
                                        disabled={isLoading || !repayAmount}
                                        className="h-10"
                                    >
                                        Repay
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    )
}