import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { formatUnits, formatEther } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Alert, AlertDescription } from '../../ui/alert'
import { parseEther } from 'ethers'
import { ArrowUpDown, AlertCircle, Coins } from 'lucide-react'
import { LendingPoolStatus } from '../shared/LendingPoolStatus'
import { COLLATERAL_TOKENS } from '../../../App'
import TLSNExtensionTrigger from './TLSNTrigger';

export default function BorrowerPanel({ contract, account }) {

    const [tlsnDataCollected, setTlsnDataCollected] = useState(false);
    const [tlsnData, setTlsnData] = useState(null);
    const [showTlsnSection, setShowTlsnSection] = useState(true);

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
    const [activeTab, setActiveTab] = useState('collateral') // NEW: tab state
    const [creditScore, setCreditScore] = useState({
        currentScore: 0,
        previousScore: 0,
        hasImproved: false,
        improvementPercentage: 0
    })
    const [withdrawableAmounts, setWithdrawableAmounts] = useState({})
    const [showPartialWithdraw, setShowPartialWithdraw] = useState(false)
    const [partialWithdrawToken, setPartialWithdrawToken] = useState('')
    const [partialWithdrawAmount, setPartialWithdrawAmount] = useState('')

    useEffect(() => {
        if (contract && account) {
            loadUserInfo()
            loadCurrentValues()
            loadCollateralTokens()
            checkNetwork()
            fetchCreditScore()
        }
    }, [contract, account])

    const checkNetwork = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)
            if (chainId === 31337) setTokenSymbol('ETH')
            else if (chainId === 57054) setTokenSymbol('SONIC')
            else if (chainId === 11155111) setTokenSymbol('ETH')
            else setTokenSymbol('ETH')
        } catch (err) {
            setTokenSymbol('ETH')
        }
    }

    const loadCurrentValues = async () => {
        try {
            const creditScore = await contract.getCreditScore(account)
            const collateralValue = await contract.getTotalCollateralValue(account)
            const existingDebt = await contract.getMyDebt()
            const totalFunds = await contract.getBalance()
            const maxBorrowAmount = totalFunds / 2n
            setCurrentValues({
                creditScore: creditScore.toString(),
                collateralValue: formatEther(collateralValue),
                existingDebt: formatEther(existingDebt),
                maxBorrowAmount: formatEther(maxBorrowAmount)
            })
        } catch (err) { }
    }

    const loadCollateralTokens = async () => {
        try {
            const tokens = await contract.getAllowedCollateralTokens()
            setCollateralTokens(tokens)
            if (tokens.length > 0) {
                setSelectedCollateral(tokens[0])
                await loadCollateralPrices(tokens)
            }
        } catch (err) { }
    }

    const loadCollateralPrices = async (tokens) => {
        try {
            const prices = {}
            for (const token of tokens) {
                const price = await contract.getTokenValue(token)
                prices[token] = formatEther(price)
            }
            setCollateralPrices(prices)
        } catch (err) { }
    }

    const handleCollateralChange = async (tokenAddress) => {
        setSelectedCollateral(tokenAddress)
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
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()
            const tokenContract = new ethers.Contract(
                selectedCollateral,
                ['function approve(address spender, uint256 amount) public returns (bool)'],
                signer
            )
            const approveTx = await tokenContract.approve(contract.target, parseEther(depositAmount))
            await approveTx.wait()
            const contractWithSigner = contract.connect(signer)
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
        } catch (err) { }
    }

    const fetchCreditScore = async () => {
        if (!contract || !account) return

        try {
            const currentScore = await contract.getCreditScore(account)
            const scoreNum = Number(currentScore)

            // Get previous score from localStorage for comparison
            const storageKey = `creditScore_${account}`
            const previousScore = parseInt(localStorage.getItem(storageKey) || '0')

            const hasImproved = scoreNum > previousScore
            const improvementPercentage = previousScore > 0 ?
                ((scoreNum - previousScore) / previousScore) * 100 : 0

            setCreditScore({
                currentScore: scoreNum,
                previousScore,
                hasImproved,
                improvementPercentage
            })

            // Store current score for next comparison
            localStorage.setItem(storageKey, scoreNum.toString())

            // Calculate withdrawable amounts for each token
            await calculateWithdrawableAmounts(scoreNum)
        } catch (err) {
            console.error('Failed to fetch credit score:', err)
        }
    }

    const calculateWithdrawableAmounts = async (creditScore) => {
        if (!contract || !account || creditScore <= 0) return

        try {
            const amounts = {}
            for (const token of collateralTokens) {
                const balance = await contract.getCollateral(account, token)
                const balanceNum = Number(formatEther(balance))

                if (balanceNum > 0) {
                    // Base withdrawable amount (10% base)
                    const baseWithdrawable = balanceNum * 0.1

                    // Credit score bonus: higher score allows more withdrawal
                    const creditBonus = Math.min((creditScore - 25) / 75, 0.4) // Up to 40% bonus for score 100
                    const totalWithdrawableRatio = Math.min(0.1 + creditBonus, 0.5) // Max 50% withdrawable

                    const withdrawableAmount = balanceNum * totalWithdrawableRatio
                    amounts[token] = withdrawableAmount.toFixed(6)
                }
            }
            setWithdrawableAmounts(amounts)
        } catch (err) {
            console.error('Failed to calculate withdrawable amounts:', err)
        }
    }

    const handlePartialWithdraw = async () => {
        if (!partialWithdrawToken || !partialWithdrawAmount) return

        try {
            setIsLoading(true)
            setError('')

            const tx = await contract.withdrawCollateral(
                partialWithdrawToken,
                parseEther(partialWithdrawAmount)
            )
            await tx.wait()

            await loadCurrentValues()
            await fetchCreditScore()
            setPartialWithdrawAmount('')
            setPartialWithdrawToken('')
            setShowPartialWithdraw(false)
            setError('Partial withdrawal successful!')
        } catch (err) {
            setError(err.message || 'Failed to withdraw collateral')
        } finally {
            setIsLoading(false)
        }
    }

    // Helper to get symbol for a token address
    const getTokenSymbol = (address) => {
        return COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase())?.symbol || address
    }

    // Helper to get name for a token address
    const getTokenName = (address) => {
        return COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase())?.name || address
    }

    return (
        <div className="space-y-4">
            <LendingPoolStatus contract={contract} />

            <div>
                <div
                    role="tablist"
                    aria-orientation="horizontal"
                    className="h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground grid w-full grid-cols-3"
                    tabIndex={0}
                    data-orientation="horizontal"
                    style={{ outline: "none" }}
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "collateral"}
                        aria-controls="radix-rh-content-collateral"
                        data-state={activeTab === "collateral" ? "active" : "inactive"}
                        id="radix-rh-trigger-collateral"
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${activeTab === "collateral" ? "bg-background text-foreground shadow" : ""}`}
                        tabIndex={-1}
                        data-orientation="horizontal"
                        data-radix-collection-item=""
                        onClick={() => setActiveTab("collateral")}
                    >
                        Collateral
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "borrow"}
                        aria-controls="radix-rh-content-borrow"
                        data-state={activeTab === "borrow" ? "active" : "inactive"}
                        id="radix-rh-trigger-borrow"
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${activeTab === "borrow" ? "bg-background text-foreground shadow" : ""}`}
                        tabIndex={-1}
                        data-orientation="horizontal"
                        data-radix-collection-item=""
                        onClick={() => setActiveTab("borrow")}
                    >
                        Borrow
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "repay"}
                        aria-controls="radix-rh-content-repay"
                        data-state={activeTab === "repay" ? "active" : "inactive"}
                        id="radix-rh-trigger-repay"
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${activeTab === "repay" ? "bg-background text-foreground shadow" : ""}`}
                        tabIndex={-1}
                        data-orientation="horizontal"
                        data-radix-collection-item=""
                        onClick={() => setActiveTab("repay")}
                    >
                        Repay
                    </button>
                </div>

                {/* Collateral Tab */}
                {activeTab === "collateral" && (
                    <div
                        data-state="active"
                        data-orientation="horizontal"
                        role="tabpanel"
                        aria-labelledby="radix-rh-trigger-collateral"
                        id="radix-rh-content-collateral"
                        tabIndex={0}
                        className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <div className="rounded-xl border text-card-foreground shadow bg-gradient-to-br from-background to-muted/50">
                            <div className="flex flex-col space-y-1.5 p-6">
                                <h3 className="font-semibold leading-none tracking-tight flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield h-5 w-5" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>
                                    Collateral Management
                                </h3>
                            </div>
                            <div className="p-6 pt-0 space-y-6">
                                {/* Credit Score Display */}
                                <div className="p-4 rounded-lg bg-background/50 border">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Credit Score</p>
                                            <p className="text-2xl font-bold">{creditScore.currentScore}</p>
                                        </div>
                                        {creditScore.hasImproved && (
                                            <div className="flex items-center gap-2 text-green-600">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trending-up">
                                                    <polyline points="22,7 13.5,15.5 8.5,10.5 2,17"></polyline>
                                                    <polyline points="16,7 22,7 22,13"></polyline>
                                                </svg>
                                                <div className="text-right">
                                                    <p className="text-sm">Improved +{creditScore.improvementPercentage.toFixed(1)}%</p>
                                                    <p className="text-xs">More withdrawal available</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Collateral Position Block */}
                                <div className="text-sm [&_p]:leading-relaxed text-blue-700">
                                    <div className="space-y-2">
                                        <p className="font-medium">Your Collateral Position:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Current Collateral: {currentValues?.collateralValue || '0.0'} ETH</li>
                                            <li>Credit Score: {creditScore.currentScore}/100</li>
                                            <li>Required Collateral Ratio: 130% of borrow amount</li>
                                            {creditScore.currentScore > 25 && (
                                                <li className="text-green-600">✓ Partial withdrawal available due to good credit</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>

                                {/* Enhanced Collateral Table */}
                                {collateralTokens.length > 0 && (
                                    <div className="space-y-4">
                                        <h4 className="font-medium">Your Collateral Tokens:</h4>
                                        <div className="rounded-md border">
                                            <table className="w-full">
                                                <thead>
                                                    <tr className="border-b">
                                                        <th className="text-left p-3 text-sm font-medium">Token</th>
                                                        <th className="text-left p-3 text-sm font-medium">Balance</th>
                                                        <th className="text-left p-3 text-sm font-medium">Withdrawable</th>
                                                        <th className="text-left p-3 text-sm font-medium">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {collateralTokens.map((token) => {
                                                        const tokenInfo = COLLATERAL_TOKENS.find(t =>
                                                            t.address.toLowerCase() === token.toLowerCase()
                                                        )
                                                        const withdrawable = withdrawableAmounts[token] || '0'

                                                        return (
                                                            <tr key={token} className="border-b last:border-0">
                                                                <td className="p-3">
                                                                    <div className="flex items-center gap-2">
                                                                        {tokenInfo?.symbol || 'Unknown'}
                                                                        {['USDC', 'USDT'].includes(tokenInfo?.symbol) && (
                                                                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">Stable</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="p-3 text-sm">
                                                                    {collateralBalances[token] ?
                                                                        Number(collateralBalances[token]).toFixed(6) :
                                                                        '0.000000'
                                                                    }
                                                                </td>
                                                                <td className="p-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm">{withdrawable}</span>
                                                                        {Number(withdrawable) > 0 && (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-unlock text-green-500">
                                                                                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                                                                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                                                                            </svg>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="p-3">
                                                                    {Number(withdrawable) > 0 && (
                                                                        <button
                                                                            className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 transition-colors"
                                                                            onClick={() => {
                                                                                setPartialWithdrawToken(token)
                                                                                setShowPartialWithdraw(true)
                                                                            }}
                                                                        >
                                                                            Withdraw
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Partial Withdrawal Modal */}
                                {showPartialWithdraw && (
                                    <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
                                        <div className="flex items-center gap-2 mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-unlock text-green-600">
                                                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                                            </svg>
                                            <h4 className="font-medium text-green-800">Partial Withdrawal Available</h4>
                                        </div>
                                        <p className="text-sm text-green-700 mb-3">
                                            Your improved credit score allows partial collateral withdrawal
                                        </p>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-sm font-medium text-green-800">Token</label>
                                                <p className="text-sm">{getTokenSymbol(partialWithdrawToken)}</p>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium text-green-800">Amount</label>
                                                <input
                                                    className="flex h-9 rounded-md border border-green-300 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500 w-full"
                                                    type="number"
                                                    placeholder="Enter amount to withdraw"
                                                    value={partialWithdrawAmount}
                                                    onChange={(e) => setPartialWithdrawAmount(e.target.value)}
                                                    max={withdrawableAmounts[partialWithdrawToken]}
                                                    step="0.000001"
                                                />
                                                <p className="text-xs text-green-600 mt-1">
                                                    Max withdrawable: {withdrawableAmounts[partialWithdrawToken]} tokens
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-green-600 text-white shadow hover:bg-green-700 px-4 py-2"
                                                    onClick={handlePartialWithdraw}
                                                    disabled={isLoading || !partialWithdrawAmount}
                                                >
                                                    {isLoading ? 'Withdrawing...' : 'Withdraw'}
                                                </button>
                                                <button
                                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-green-300 bg-white shadow-sm hover:bg-green-50 text-green-800 px-4 py-2"
                                                    onClick={() => {
                                                        setShowPartialWithdraw(false)
                                                        setPartialWithdrawToken('')
                                                        setPartialWithdrawAmount('')
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Deposit/Withdraw UI */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Select Token</label>
                                    <select
                                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full"
                                        value={selectedCollateral || ""}
                                        onChange={e => handleCollateralChange(e.target.value)}
                                    >
                                        <option value="" disabled>Select a token</option>
                                        {COLLATERAL_TOKENS
                                            .filter(token => ['GLINT', 'USDC', 'USDT'].includes(token.symbol))
                                            .map(token => (
                                                <option key={token.address} value={token.address}>
                                                    {token.symbol} {token.name ? `- ${token.name}` : ""}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Amount</label>
                                    <input
                                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full"
                                        placeholder="Enter amount to deposit"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={depositAmount}
                                        onChange={e => setDepositAmount(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <button
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 flex-1 h-12"
                                        onClick={handleDepositCollateral}
                                        disabled={isLoading || !depositAmount || !selectedCollateral}
                                    >
                                        Deposit
                                    </button>
                                    <input
                                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full"
                                        placeholder="Enter amount to withdraw"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={withdrawAmount}
                                        onChange={e => setWithdrawAmount(e.target.value)}
                                    />
                                    <button
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground px-4 py-2 flex-1 h-12"
                                        onClick={handleWithdrawCollateral}
                                        disabled={isLoading || !withdrawAmount || !selectedCollateral}
                                    >
                                        Withdraw
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TLSN Verification Section */}
<div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
    <div className="flex items-start gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield-check text-blue-600 mt-0.5">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
            <path d="m9 12 2 2 4-4"/>
        </svg>
        <div className="flex-1">
            <h4 className="font-medium text-blue-900 mb-2">Enhance Your Credit Profile</h4>
            <p className="text-sm text-blue-800 mb-3">
                Use TLS Notary to verify your financial data and potentially improve your credit score and borrowing terms.
            </p>
            <TLSNExtensionTrigger />
        </div>
    </div>
</div>

                {/* Borrow Tab */}
                {activeTab === "borrow" && (
                    <div
                        data-state="active"
                        data-orientation="horizontal"
                        role="tabpanel"
                        aria-labelledby="radix-rh-trigger-borrow"
                        id="radix-rh-content-borrow"
                        tabIndex={0}
                        className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <div className="rounded-xl border text-card-foreground shadow bg-gradient-to-br from-background to-muted/50">
                            <div className="flex flex-col space-y-1.5 p-6">
                                <h3 className="font-semibold leading-none tracking-tight flex items-center gap-2">
                                    <Coins className="h-5 w-5" />
                                    Borrow Funds
                                </h3>
                            </div>
                            <div className="p-6 pt-0 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Amount to Borrow ({tokenSymbol})</label>
                                    <input
                                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full"
                                        placeholder="Enter amount to borrow"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={borrowAmount}
                                        onChange={e => setBorrowAmount(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <button
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-12 w-full"
                                        onClick={handleBorrow}
                                        disabled={isLoading || !borrowAmount}
                                    >
                                        Borrow
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Repay Tab */}
                {activeTab === "repay" && (
                    <div
                        data-state="active"
                        data-orientation="horizontal"
                        role="tabpanel"
                        aria-labelledby="radix-rh-trigger-repay"
                        id="radix-rh-content-repay"
                        tabIndex={0}
                        className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <div className="rounded-xl border text-card-foreground shadow bg-gradient-to-br from-background to-muted/50">
                            <div className="flex flex-col space-y-1.5 p-6">
                                <h3 className="font-semibold leading-none tracking-tight flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5" />
                                    Repay Loan
                                </h3>
                            </div>
                            <div className="p-6 pt-0 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Amount to Repay ({tokenSymbol})</label>
                                    <input
                                        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full"
                                        placeholder="Enter amount to repay"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={repayAmount}
                                        onChange={e => setRepayAmount(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <button
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 h-12 w-full"
                                        onClick={handleRepay}
                                        disabled={isLoading || !repayAmount}
                                    >
                                        Repay
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Inactive tab panels for accessibility */}
                {activeTab !== "collateral" && (
                    <div
                        data-state="inactive"
                        data-orientation="horizontal"
                        role="tabpanel"
                        aria-labelledby="radix-rh-trigger-collateral"
                        hidden
                        id="radix-rh-content-collateral"
                        tabIndex={0}
                        className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    ></div>
                )}
                {activeTab !== "borrow" && (
                    <div
                        data-state="inactive"
                        data-orientation="horizontal"
                        role="tabpanel"
                        aria-labelledby="radix-rh-trigger-borrow"
                        hidden
                        id="radix-rh-content-borrow"
                        tabIndex={0}
                        className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    ></div>
                )}
                {activeTab !== "repay" && (
                    <div
                        data-state="inactive"
                        data-orientation="horizontal"
                        role="tabpanel"
                        aria-labelledby="radix-rh-trigger-repay"
                        hidden
                        id="radix-rh-content-repay"
                        tabIndex={0}
                        className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    ></div>
                )}
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    )
}
