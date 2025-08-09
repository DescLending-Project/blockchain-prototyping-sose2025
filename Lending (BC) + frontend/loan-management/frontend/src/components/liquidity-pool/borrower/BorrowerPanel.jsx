import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { formatUnits, formatEther } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Alert, AlertDescription } from '../../ui/alert'
import { Badge } from '../../ui/badge'
import { parseEther } from 'ethers'
import { ArrowUpDown, AlertCircle, Coins, Shield, CheckCircle, Clock, Terminal, Download, Copy, RotateCcw, RefreshCw } from 'lucide-react'
import { LendingPoolStatus } from '../shared/LendingPoolStatus'
import { COLLATERAL_TOKENS } from '../../../App'

export default function BorrowerPanel({ contract, account, contracts }) {
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
    const [activeTab, setActiveTab] = useState('collateral')
    const [creditScore, setCreditScore] = useState({
        currentScore: 0,
        previousScore: 0,
        hasImproved: false,
        improvementPercentage: 0,
        isVerified: false
    })
    const [withdrawableAmounts, setWithdrawableAmounts] = useState({})
    const [showPartialWithdraw, setShowPartialWithdraw] = useState(false)
    const [partialWithdrawToken, setPartialWithdrawToken] = useState('')
    const [partialWithdrawAmount, setPartialWithdrawAmount] = useState('')
    const [collateralBalances, setCollateralBalances] = useState({})

    // Credit verification states
    const [verificationStep, setVerificationStep] = useState('none') // 'none', 'tlsn', 'tlsn-error', 'export', 'proof', 'verified'
    const [tlsnData, setTlsnData] = useState(null)
    const [tlsnError, setTlsnError] = useState(null)
    const [generatedCommand, setGeneratedCommand] = useState('')
    const [showVerificationFlow, setShowVerificationFlow] = useState(false)
    const [verificationRequired, setVerificationRequired] = useState(true)

    useEffect(() => {
        if (contract && account) {
            loadUserInfo()
            loadCurrentValues()
            loadCollateralTokens()
            checkNetwork()
            fetchCreditScore()
        }
    }, [contract, account, contracts])

    // Listen for credit score updates
    useEffect(() => {
        const handleCreditScoreUpdate = (event) => {
            console.log('Credit score updated:', event.detail);
            fetchCreditScore();
            setVerificationStep('verified');
            setShowVerificationFlow(false);
        };

        window.addEventListener('creditScoreUpdated', handleCreditScoreUpdate);
        return () => {
            window.removeEventListener('creditScoreUpdated', handleCreditScoreUpdate);
        };
    }, []);

    // Listen for credit score events from contract
    useEffect(() => {
        if (contracts?.creditScoreVerifier && account) {
            const filter = contracts.creditScoreVerifier.filters.CreditScoreSubmitted(account);
            
            const handleCreditScoreEvent = (user, score, serverName, stateRootProvider, timestamp) => {
                console.log('Credit score event received:', { user, score, serverName, stateRootProvider, timestamp });
                setCreditScore(prev => ({
                    ...prev,
                    currentScore: Number(score),
                    isVerified: true
                }));
                setVerificationStep('verified');
                setShowVerificationFlow(false);
                window.dispatchEvent(new CustomEvent('creditScoreUpdated', { detail: { score: Number(score) } }));
            };

            contracts.creditScoreVerifier.on(filter, handleCreditScoreEvent);

            return () => {
                contracts.creditScoreVerifier.off(filter, handleCreditScoreEvent);
            };
        }
    }, [contracts, account]);

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
                await loadCollateralBalances(tokens)
            }
        } catch (err) { }
    }

    const loadCollateralBalances = async (tokens) => {
        try {
            const balances = {}
            for (const token of tokens) {
                const balance = await contract.getCollateral(account, token)
                balances[token] = formatEther(balance)
            }
            setCollateralBalances(balances)
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
            let currentScore = 0;
            let isVerified = false;
            
            // get from RISC Zero verifier first
            if (contracts?.creditScoreVerifier) {
                try {
                    const result = await contracts.creditScoreVerifier.getCreditScore(account);
                    if (result[1]) { // isValid
                        currentScore = Number(result[0]);
                        isVerified = true;
                        setVerificationStep('verified');
                        console.log('Got verified credit score from RISC Zero:', currentScore);
                    }
                } catch (err) {
                    console.log('No RISC Zero credit score found, falling back to contract score');
                }
            }
            
            // Fallback to existing contract credit score, this is for legacy stuff
            if (currentScore === 0) {
                try {
                    const contractScore = await contract.getCreditScore(account);
                    currentScore = Number(contractScore);
                    isVerified = false;
                } catch (err) {
                    console.log('No contract credit score found');
                }
            }

            // Get previous score from localStorage for comparison
            const storageKey = `creditScore_${account}`
            const previousScore = parseInt(localStorage.getItem(storageKey) || '0')

            const hasImproved = currentScore > previousScore
            const improvementPercentage = previousScore > 0 ?
                ((currentScore - previousScore) / previousScore) * 100 : 0

            setCreditScore({
                currentScore: currentScore,
                previousScore,
                hasImproved,
                improvementPercentage,
                isVerified
            })

            // Store current score for next comparison
            localStorage.setItem(storageKey, currentScore.toString())

            // Calculate withdrawable amounts for each token
            await calculateWithdrawableAmounts(currentScore, isVerified)
        } catch (err) {
            console.error('Failed to fetch credit score:', err)
        }
    }

    const calculateWithdrawableAmounts = async (creditScore, isVerified) => {
        if (!contract || !account || creditScore <= 0) return

        try {
            const amounts = {}
            for (const token of collateralTokens) {
                const balance = await contract.getCollateral(account, token)
                const balanceNum = Number(formatEther(balance))

                if (balanceNum > 0) {
                    let baseWithdrawable = balanceNum * 0.1
                    let creditBonus = Math.min((creditScore - 25) / 75, 0.4)
                    
                    if (isVerified) {
                        creditBonus += 0.1;
                    }
                    
                    const totalWithdrawableRatio = Math.min(0.1 + creditBonus, 0.6)
                    const withdrawableAmount = balanceNum * totalWithdrawableRatio
                    amounts[token] = withdrawableAmount.toFixed(6)
                }
            }
            setWithdrawableAmounts(amounts)
        } catch (err) {
            console.error('Failed to calculate withdrawable amounts:', err)
        }
    }

    // Credit verification flow functions
    const startCreditVerification = () => {
        setShowVerificationFlow(true);
        setVerificationStep('tlsn');
        setTlsnError(null);
        
        if (window.openTLSNExtension && window.tlsnExtensionAvailable) {
            try {
                const result = window.openTLSNExtension();
                console.log('TLSNotary extension result:', result);
                
                setTimeout(() => {
                    const tlsnCompleted = false;
                    
                    if (tlsnCompleted) {
                        setTlsnData({
                            creditScore: 720,
                            bankName: "Real Bank",
                            attestationProof: "0xreal...",
                            sessionData: { validated: true },
                            isRealData: true
                        });
                        setVerificationStep('export');
                    } else {
                        setTlsnError({
                            message: "TLSNotary verification failed or timed out",
                            details: "The extension may need more time or encountered an error"
                        });
                        setVerificationStep('tlsn-error');
                    }
                }, 10000);
                
            } catch (error) {
                console.error('Error calling TLSNotary extension:', error);
                setTlsnError({
                    message: "Failed to start TLSNotary extension",
                    details: error.message
                });
                setVerificationStep('tlsn-error');
            }
        } else {
            console.log('TLSNotary Extension not available');
            setTlsnError({
                message: "TLSNotary Extension not found",
                details: "Please install the TLSNotary extension first"
            });
            setVerificationStep('tlsn-error');
        }
    };

    const retryTLSNotary = () => {
        setTlsnError(null);
        startCreditVerification();
    };

    const useMockData = () => {
        console.log('Using mock data for testing...');
        setTlsnData({
            creditScore: 750,
            bankName: "Mock Bank",
            attestationProof: "0x1234...",
            sessionData: { validated: true },
            isRealData: false
        });
        setTlsnError(null);
        setVerificationStep('export');
    };

    const generateProofInstructions = () => {
        const chainId = 11155111; // Default to Sepolia
        const rpcUrl = 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY';
        const contractAddress = contracts?.creditScoreVerifier?.target || contracts?.creditScoreVerifier?.address;
        
        const command = `RISC0_USE_DOCKER=1 cargo run -p host --bin host --release -- \\
  --tradfi-receipt-path host/receipts/tradfi_score.bin \\
  --account-receipt-path host/receipts/account_receipt.bin \\
  --stateroot-receipt-path host/receipts/alchemy_stateroot.bin \\
  --chain-id ${chainId} \\
  --rpc-url ${rpcUrl} \\
  --contract ${contractAddress} \\
  --eth-wallet-private-key YOUR_PRIVATE_KEY`;

        setGeneratedCommand(command);
        setVerificationStep('proof');
    };

    const copyCommand = () => {
        navigator.clipboard.writeText(generatedCommand);
        alert('Command copied to clipboard!');
    };

    const skipVerification = () => {
        // For testing purposes
        setCreditScore(prev => ({
            ...prev,
            currentScore: 750,
            isVerified: true
        }));
        setVerificationStep('verified');
        setShowVerificationFlow(false);
    };

    const resetVerification = () => {
        setVerificationStep('none');
        setShowVerificationFlow(false);
        setTlsnData(null);
        setTlsnError(null);
        setGeneratedCommand('');
    };

    const canProceedToBorrow = () => {
        return verificationStep === 'verified' || !verificationRequired;
    };

    const handleBorrow = async () => {
        if (!canProceedToBorrow()) {
            setError('Please complete credit verification before borrowing');
            return;
        }

        try {
            setIsLoading(true)
            setError('')

            // Simplified borrow call - no nullifier needed since RISC0 handles verification
            console.log('Borrowing amount:', borrowAmount);

            const tx = await contract.borrow(parseEther(borrowAmount))
            await tx.wait()
            await loadUserInfo()
            await loadCurrentValues()
            setBorrowAmount('')
            // Reset verification for next borrow
            resetVerification()
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
            await loadCollateralBalances(collateralTokens)
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
            await loadCollateralBalances(collateralTokens)
            setWithdrawAmount('')
        } catch (err) {
            setError(err.message || 'Failed to withdraw collateral')
        } finally {
            setIsLoading(false)
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
            await loadCollateralBalances(collateralTokens)
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
                                    <Shield className="h-5 w-5" />
                                    Collateral Management
                                </h3>
                            </div>
                            <div className="p-6 pt-0 space-y-6">
                                {/* Credit Score Display */}
                                <div className="p-4 rounded-lg bg-background/50 border">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm text-muted-foreground">Credit Score</p>
                                                {creditScore.isVerified && (
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                        <Shield className="h-3 w-3 mr-1" />
                                                        RISC Zero Verified
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-2xl font-bold">{creditScore.currentScore}</p>
                                            {creditScore.currentScore === 0 && (
                                                <div className="mt-2 space-y-2">
                                                    <p className="text-xs text-gray-500">No verified credit score found</p>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => {
                                                            window.dispatchEvent(new CustomEvent('navigateToTab', { detail: 'credit-score' }));
                                                        }}
                                                        className="text-xs"
                                                    >
                                                        <Shield className="h-3 w-3 mr-1" />
                                                        Get Verified Score
                                                    </Button>
                                                </div>
                                            )}
                                            {!creditScore.isVerified && creditScore.currentScore > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-xs text-orange-600">Contract score (not verified)</p>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => {
                                                            window.dispatchEvent(new CustomEvent('navigateToTab', { detail: 'credit-score' }));
                                                        }}
                                                        className="text-xs mt-1"
                                                    >
                                                        <Shield className="h-3 w-3 mr-1" />
                                                        Verify with RISC Zero
                                                    </Button>
                                                </div>
                                            )}
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
                                    
                                    {/* FICO Rating Display */}
                                    {creditScore.currentScore > 0 && (
                                        <div className="mt-3">
                                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                <span>Poor</span>
                                                <span>Fair</span>
                                                <span>Good</span>
                                                <span>Excellent</span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div 
                                                    className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full transition-all duration-1000"
                                                    style={{ width: `${((creditScore.currentScore - 300) / 550) * 100}%` }}
                                                ></div>
                                            </div>
                                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                <span>300</span>
                                                <span>850</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Collateral Position Block */}
                                <div className="text-sm [&_p]:leading-relaxed text-blue-700">
                                    <div className="space-y-2">
                                        <p className="font-medium">Your Collateral Position:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Current Collateral: {currentValues?.collateralValue || '0.0'} ETH</li>
                                            <li>Credit Score: {creditScore.currentScore}{creditScore.isVerified ? ' (Verified)' : ''}/850</li>
                                            <li>Required Collateral Ratio: 130% of borrow amount</li>
                                            {creditScore.currentScore > 25 && (
                                                <li className="text-green-600">✓ Partial withdrawal available due to {creditScore.isVerified ? 'verified ' : ''}credit</li>
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
                                            <h4 className="font-medium text-green-800">
                                                Partial Withdrawal Available {creditScore.isVerified && <Badge variant="outline" className="ml-2 bg-green-100 text-green-700 border-green-300">RISC Zero Verified</Badge>}
                                            </h4>
                                        </div>
                                        <p className="text-sm text-green-700 mb-3">
                                            Your {creditScore.isVerified ? 'verified ' : ''}credit score allows partial collateral withdrawal
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
                                                    {creditScore.isVerified && <span className="font-semibold"> (Enhanced due to verification)</span>}
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

                {/* Borrow Tab - Enhanced with Credit Verification Flow */}
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
                                {/* Credit Verification Section */}
                                <div className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-5 w-5 text-blue-600" />
                                            <h4 className="font-medium text-blue-900">Credit Verification Required</h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {verificationStep === 'verified' ? (
                                                <Badge className="bg-green-100 text-green-800 border-green-200">
                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                    Verified
                                                </Badge>
                                            ) : verificationStep === 'none' ? (
                                                <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                                                    <AlertCircle className="h-3 w-3 mr-1" />
                                                    Required
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-yellow-50 text-yellow-600 border-yellow-200">
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    In Progress
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {verificationStep === 'none' && (
                                        <div className="space-y-3">
                                            <p className="text-sm text-blue-700">
                                                Fresh credit verification is required for each borrowing transaction to ensure accurate risk assessment.
                                            </p>
                                            <div className="flex gap-2">
                                                <Button onClick={startCreditVerification} className="flex items-center gap-2">
                                                    <Shield className="h-4 w-4" />
                                                    Start Credit Verification
                                                </Button>
                                                <Button 
                                                    variant="outline" 
                                                    onClick={skipVerification}
                                                    className="flex items-center gap-2"
                                                >
                                                    <Terminal className="h-4 w-4" />
                                                    Skip (Testing)
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {verificationStep === 'verified' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                                <CheckCircle className="h-5 w-5 text-green-600" />
                                                <div>
                                                    <p className="font-medium text-green-800">Credit Score Verified</p>
                                                    <p className="text-sm text-green-600">
                                                        Score: {creditScore.currentScore} 
                                                        {creditScore.isVerified && " (RISC Zero Verified)"}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={resetVerification}
                                                className="flex items-center gap-2"
                                            >
                                                <RefreshCw className="h-3 w-3" />
                                                Get Fresh Verification
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {/* Credit Verification Flow Modal */}
                                {showVerificationFlow && (
                                    <div className="border rounded-lg p-6 bg-white shadow-lg">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="font-medium">Credit Verification Process</h4>
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                onClick={() => setShowVerificationFlow(false)}
                                            >
                                                ×
                                            </Button>
                                        </div>

                                        {/* Progress Steps */}
                                        <div className="flex items-center space-x-4 mb-6">
                                            {['tlsn', 'export', 'proof', 'verified'].map((stepName, index) => {
                                                const currentStepIndex = ['tlsn', 'tlsn-error', 'export', 'proof', 'verified'].indexOf(verificationStep);
                                                const targetStepIndex = ['tlsn', 'export', 'proof', 'verified'].indexOf(stepName);
                                                
                                                return (
                                                    <div key={stepName} className="flex items-center">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                                            verificationStep === stepName || (verificationStep === 'tlsn-error' && stepName === 'tlsn') ? 'bg-blue-600 text-white' :
                                                            currentStepIndex > targetStepIndex ? 'bg-green-600 text-white' :
                                                            'bg-gray-200 text-gray-600'
                                                        }`}>
                                                            {currentStepIndex > targetStepIndex ? (
                                                                <CheckCircle className="h-4 w-4" />
                                                            ) : (
                                                                index + 1
                                                            )}
                                                        </div>
                                                        {index < 3 && (
                                                            <div className={`w-16 h-1 ${
                                                                currentStepIndex > targetStepIndex ? 'bg-green-600' : 'bg-gray-200'
                                                            }`} />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Step Content */}
                                        {verificationStep === 'tlsn' && (
                                            <div className="text-center space-y-4">
                                                <div className="animate-pulse">
                                                    <Shield className="h-16 w-16 text-blue-600 mx-auto" />
                                                </div>
                                                <h3 className="text-xl font-semibold">TLSNotary in Progress</h3>
                                                <p className="text-gray-600">
                                                    Please complete the verification in the TLSNotary extension window...
                                                </p>
                                                <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                                                    <Clock className="h-4 w-4" />
                                                    <span>This may take a few minutes</span>
                                                </div>
                                                <Alert>
                                                    <AlertCircle className="h-4 w-4" />
                                                    <AlertDescription>
                                                        Waiting for TLSNotary extension to complete verification. If this takes too long, the process may have failed.
                                                    </AlertDescription>
                                                </Alert>
                                            </div>
                                        )}

                                        {verificationStep === 'tlsn-error' && tlsnError && (
                                            <div className="space-y-4">
                                                <Alert variant="destructive">
                                                    <AlertCircle className="h-4 w-4" />
                                                    <AlertDescription>
                                                        <div className="space-y-1">
                                                            <p className="font-medium">{tlsnError.message}</p>
                                                            {tlsnError.details && (
                                                                <p className="text-sm text-red-600">{tlsnError.details}</p>
                                                            )}
                                                        </div>
                                                    </AlertDescription>
                                                </Alert>

                                                <div className="text-center space-y-4">
                                                    <h3 className="text-lg font-semibold">What would you like to do?</h3>
                                                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                                        <Button onClick={retryTLSNotary} variant="outline" className="flex items-center gap-2">
                                                            <RotateCcw className="h-4 w-4" />
                                                            Retry TLSNotary
                                                        </Button>
                                                        <Button onClick={useMockData} variant="secondary" className="flex items-center gap-2">
                                                            <Terminal className="h-4 w-4" />
                                                            Use Mock Data for Testing
                                                        </Button>
                                                    </div>
                                                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                                                        You can retry TLSNotary verification or continue with mock data to test the complete integration flow.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {verificationStep === 'export' && tlsnData && (
                                            <div className="space-y-4">
                                                <div className="flex items-center space-x-2">
                                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                                    <h3 className="text-lg font-semibold">TLSNotary Complete</h3>
                                                    {!tlsnData.isRealData && (
                                                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                                            Mock Data
                                                        </Badge>
                                                    )}
                                                </div>
                                                
                                                <Alert>
                                                    <AlertCircle className="h-4 w-4" />
                                                    <AlertDescription>
                                                        TLSNotary verification successful! Credit score: {tlsnData.creditScore} from {tlsnData.bankName}
                                                        {!tlsnData.isRealData && " (using mock data for testing)"}
                                                    </AlertDescription>
                                                </Alert>

                                                <div className="space-y-2">
                                                    <p className="text-sm text-gray-600">
                                                        Next, you'll need to generate a zero-knowledge proof using RISC Zero. 
                                                        This creates cryptographic evidence without revealing your private data.
                                                    </p>
                                                    <Button onClick={generateProofInstructions} className="w-full">
                                                        <Download className="h-4 w-4 mr-2" />
                                                        Generate Proof Instructions
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {verificationStep === 'proof' && generatedCommand && (
                                            <div className="space-y-4">
                                                <h3 className="text-lg font-semibold flex items-center">
                                                    <Terminal className="h-5 w-5 mr-2" />
                                                    Generate Zero-Knowledge Proof
                                                </h3>
                                                
                                                <div className="space-y-3">
                                                    <p className="text-sm text-gray-600">
                                                        Run this command in your RISC Zero environment to generate and submit your proof:
                                                    </p>
                                                    
                                                    <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                                                        <pre className="whitespace-pre-wrap">{generatedCommand}</pre>
                                                    </div>
                                                    
                                                    <div className="flex space-x-2">
                                                        <Button onClick={copyCommand} variant="outline" size="sm">
                                                            <Copy className="h-4 w-4 mr-2" />
                                                            Copy Command
                                                        </Button>
                                                    </div>
                                                    
                                                    <Alert>
                                                        <AlertCircle className="h-4 w-4" />
                                                        <AlertDescription>
                                                            After running this command successfully, your verified credit score will appear automatically. 
                                                            The verification will complete when the proof is submitted to the contract.
                                                        </AlertDescription>
                                                    </Alert>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Credit Score Impact Display */}
                                {creditScore.currentScore > 0 && (
                                    <div className="p-4 border rounded-lg bg-blue-50">
                                        <h4 className="font-medium text-blue-900 mb-2">Credit Score Impact</h4>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <p className="text-blue-700">Current Score: <span className="font-semibold">{creditScore.currentScore}</span></p>
                                                {creditScore.isVerified && (
                                                    <Badge variant="outline" className="mt-1 bg-green-50 text-green-700 border-green-200">
                                                        <Shield className="h-3 w-3 mr-1" />
                                                        Verified
                                                    </Badge>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-blue-700">
                                                    Interest Rate: <span className="font-semibold">
                                                        {creditScore.currentScore >= 750 ? '3%' :
                                                         creditScore.currentScore >= 650 ? '5%' : '8%'} APR
                                                    </span>
                                                </p>
                                                <p className="text-blue-700">
                                                    Max Loan: <span className="font-semibold">
                                                        {creditScore.currentScore >= 700 ? '120%' :
                                                         creditScore.currentScore >= 650 ? '110%' : '100%'} of collateral
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Borrow Amount Input */}
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
                                        disabled={!canProceedToBorrow()}
                                    />
                                    {!canProceedToBorrow() && (
                                        <p className="text-xs text-red-600">Complete credit verification to proceed</p>
                                    )}
                                </div>

                                {/* Borrow Button */}
                                <div>
                                    <button
                                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 px-4 py-2 h-12 w-full ${
                                            canProceedToBorrow() 
                                                ? 'bg-primary text-primary-foreground shadow hover:bg-primary/90' 
                                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                        onClick={handleBorrow}
                                        disabled={isLoading || !borrowAmount || !canProceedToBorrow()}
                                    >
                                        {!canProceedToBorrow() ? 'Verification Required' : 
                                         `Borrow${creditScore.isVerified ? ' (Enhanced Terms)' : ''}`}
                                    </button>
                                </div>

                                {!canProceedToBorrow() && (
                                    <Alert>
                                        <Shield className="h-4 w-4" />
                                        <AlertDescription>
                                            Fresh credit verification is required before borrowing to ensure accurate risk assessment and proper interest rates.
                                        </AlertDescription>
                                    </Alert>
                                )}
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
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
        </div>
    )
}