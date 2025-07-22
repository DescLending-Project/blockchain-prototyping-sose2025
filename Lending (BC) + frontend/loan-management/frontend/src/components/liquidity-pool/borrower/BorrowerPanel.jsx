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
    const [activeTab, setActiveTab] = useState('collateral') // NEW: tab state

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
                                {/* Collateral Position Block */}
                                <div className="text-sm [&_p]:leading-relaxed text-blue-700">
                                    <div className="space-y-2">
                                        <p className="font-medium">Your Collateral Position:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Current Collateral: 0.0 Token</li>
                                            <li>Collateral Value in ETH:  ETH</li>
                                            <li>Required Collateral Ratio: 130% of borrow amount</li>
                                        </ul>
                                    </div>
                                </div>
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