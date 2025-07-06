import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, Wallet, Coins, Shield, AlertTriangle, ArrowUpDown, ArrowDownUp, DollarSign, Percent } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Contract } from "ethers"
import { COLLATERAL_TOKENS } from "../../../App"

interface UserPanelProps {
    contract: Contract;
    account: string | null;
    mode?: 'user' | 'lend';
}

export function UserPanel({ contract, account, mode = 'user' }: UserPanelProps) {
    const [isLiquidatable, setIsLiquidatable] = useState(false)
    const [selectedToken, setSelectedToken] = useState("")
    const [tokenBalance, setTokenBalance] = useState("0")
    const [collateralAmount, setCollateralAmount] = useState("")
    const [tokenValue, setTokenValue] = useState("0")
    const [borrowAmount, setBorrowAmount] = useState("")
    const [repayAmount, setRepayAmount] = useState("")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [healthStatus, setHealthStatus] = useState({ isHealthy: true, ratio: 0 })
    const [totalCollateralValue, setTotalCollateralValue] = useState("0")
    const [userDebt, setUserDebt] = useState("0")
    const [lendAmount, setLendAmount] = useState("")
    const [lendingAPY, setLendingAPY] = useState("0")
    const [totalLent, setTotalLent] = useState("0")
    const [creditScore, setCreditScore] = useState<number | null>(null)
    const [tokenSymbol, setTokenSymbol] = useState("")

    const fetchData = async () => {
        if (!account) return // Do not fetch if no account connected
        try {
            // Use a contract instance connected to a Provider for read operations
            const provider = new ethers.BrowserProvider(window.ethereum)
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)

            try {
                const debt = await contract.getMyDebt()
                setUserDebt(ethers.formatEther(debt))
            } catch (err) {
                console.error("Failed to fetch debt:", err)
                setUserDebt("0")
            }

            // Fetch total collateral value
            const totalCollateral = await readOnlyContract.getTotalCollateralValue(account);
            setTotalCollateralValue(ethers.formatUnits(totalCollateral, 18));

            // Fetch total pool balance
            const poolBalance = await readOnlyContract.getBalance();
            setTotalLent(ethers.formatEther(poolBalance));

            // Fetch credit score
            const userCreditScore = await readOnlyContract.getCreditScore(account);
            setCreditScore(Number(userCreditScore));

            // Fetch health status
            const healthCheck = await readOnlyContract.checkCollateralization(account);
            if (healthCheck && Array.isArray(healthCheck) && healthCheck.length >= 2) {
                const ratio = Number(ethers.formatUnits(healthCheck[1], 0));
                const percentageRatio = Math.min(ratio / 100, 100);
                setHealthStatus({
                    isHealthy: healthCheck[0],
                    ratio: percentageRatio
                });
            } else {
                setHealthStatus({ isHealthy: true, ratio: 0 });
            }

            // Get token symbol from network context
            const network = await provider.getNetwork();
            const chainId = Number(network.chainId);

            // Set appropriate token symbol based on network
            if (chainId === 31337) {
                setTokenSymbol('ETH'); // Localhost/Hardhat
            } else if (chainId === 57054) {
                setTokenSymbol('SONIC'); // Sonic testnet
            } else if (chainId === 11155111) {
                setTokenSymbol('ETH'); // Sepolia testnet
            } else {
                setTokenSymbol('ETH'); // Default fallback
            }

        } catch (err) {
            console.error("Failed to fetch data:", err)
        }
    }

    const refreshCreditScore = async () => {
        if (!account) return
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)
            const userCreditScore = await readOnlyContract.getCreditScore(account);
            setCreditScore(Number(userCreditScore));
        } catch (err) {
            console.error("Failed to refresh credit score:", err)
        }
    }

    useEffect(() => {
        if (contract && account) {
            fetchData()
        }
        // Re-fetch data when account or contract changes
    }, [contract, account])

    const fetchTokenBalance = async () => {
        if (!account || !selectedToken) return // Do not fetch if no account or token selected
        try {
            setIsLoading(true)
            // TODO: Implement token balance fetching using readOnlyContract or token contract
            const provider = new ethers.BrowserProvider(window.ethereum);
            const tokenContract = new ethers.Contract(selectedToken, ["function balanceOf(address owner) view returns (uint256)"], provider); // Basic ERC20 ABI for balanceOf
            const balance = await tokenContract.balanceOf(account);
            setTokenBalance(ethers.formatUnits(balance, 18)); // Assuming 18 decimals

        } catch (err) {
            setError("Failed to fetch token balance")
        } finally {
            setIsLoading(false)
        }
    }

    const fetchTokenValue = async () => {
        if (!account || !selectedToken) return // Do not fetch if no account or token selected
        try {
            setIsLoading(true)
            // TODO: Implement token value fetching using readOnlyContract and priceFeed
            const provider = new ethers.BrowserProvider(window.ethereum);
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)
            const value = await readOnlyContract.getTokenValue(selectedToken);
            setTokenValue(ethers.formatUnits(value, 18)); // Assuming value is returned in 1e18 units
        } catch (err) {
            console.error("Failed to fetch token value:", err);
            // setError("Failed to fetch token value")
        } finally {
            setIsLoading(false)
        }
    }

    const handleHealthCheck = async () => {
        if (!account) {
            setError("Please connect your wallet to check health status")
            return
        }
        try {
            setIsLoading(true)
            // Use read-only contract for checking health status (it's a view function)
            const provider = new ethers.BrowserProvider(window.ethereum)
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)
            const result = await readOnlyContract.checkCollateralization(account)

            if (result && Array.isArray(result) && result.length >= 2) {
                setHealthStatus({
                    isHealthy: result[0],
                    ratio: Number(ethers.formatUnits(result[1], 0)) // Assuming ratio is returned as a big number, format to a number
                });
            } else {
                setError("Failed to parse health status result");
                setHealthStatus({ isHealthy: true, ratio: 0 }); // Reset to default on parse error
            }

            setError("") // Clear previous errors on success

        } catch (err) {
            console.error("Failed to check health status:", err)
            setError("Failed to check health status")
        } finally {
            setIsLoading(false)
        }
    }

    const handleDepositCollateral = async () => {
        if (!selectedToken) {
            setError("Please select a token first")
            return
        }
        if (!collateralAmount || Number(collateralAmount) <= 0) {
            setError("Please enter a valid amount")
            return
        }
        if (!account) {
            setError("Please connect your wallet to deposit collateral")
            return
        }
        try {
            setIsLoading(true)
            setError("") // Clear previous errors
            // For ERC20 tokens, first approve the contract to spend the tokens
            const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
            const tokenContract = new ethers.Contract(selectedToken, ["function approve(address spender, uint256 amount) returns (bool)"], signer); // Basic ERC20 ABI for approve
            const amountParsed = ethers.parseUnits(collateralAmount, 18); // Assuming 18 decimals for collateral tokens
            let tx = await tokenContract.approve(contract.target, amountParsed);
            await tx.wait();

            // Then call the depositCollateral function
            tx = await contract.depositCollateral(selectedToken, amountParsed)
            await tx.wait()
            setError("Collateral deposited successfully!"); // Success message
            await fetchTokenBalance()
            await fetchData(); // Refresh overall data
            setCollateralAmount("")
        } catch (err) {
            console.error("Failed to deposit collateral:", err);
            setError(`Failed to deposit collateral: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false)
        }
    }

    const handleWithdrawCollateral = async () => {
        if (!selectedToken) {
            setError("Please select a token first")
            return
        }
        if (!collateralAmount || Number(collateralAmount) <= 0) {
            setError("Please enter a valid amount")
            return
        }
        if (!account) {
            setError("Please connect your wallet to withdraw collateral")
            return
        }
        try {
            setIsLoading(true)
            setError("") // Clear previous errors
            const tx = await contract.withdrawCollateral(selectedToken, ethers.parseUnits(collateralAmount, 18))
            await tx.wait()
            setError("Collateral withdrawn successfully!"); // Success message
            await fetchTokenBalance()
            await fetchData(); // Refresh overall data
            setCollateralAmount("")
        } catch (err) {
            console.error("Failed to withdraw collateral:", err);
            setError(`Failed to withdraw collateral: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false)
        }
    }

    const handleBorrow = async () => {
        if (!borrowAmount || Number(borrowAmount) <= 0) {
            setError("Please enter a valid amount to borrow")
            return
        }
        if (!account) {
            setError("Please connect your wallet to borrow")
            return
        }
        try {
            setIsLoading(true)
            setError("") // Clear previous errors
            const tx = await contract.borrow(ethers.parseEther(borrowAmount))
            await tx.wait()
            setError("Tokens borrowed successfully!"); // Success message
            await fetchData()
            setBorrowAmount("")
        } catch (err) {
            console.error("Failed to borrow:", err);
            setError(`Failed to borrow: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false)
        }
    }

    const handleRepay = async () => {
        if (!repayAmount || Number(repayAmount) <= 0) {
            setError("Please enter a valid amount to repay")
            return
        }
        if (!account) {
            setError("Please connect your wallet to repay")
            return
        }
        try {
            setIsLoading(true)
            setError("") // Clear previous errors
            const tx = await contract.repay({ value: ethers.parseEther(repayAmount) })
            await tx.wait()
            setError("Tokens repaid successfully!"); // Success message
            await fetchData()
            setRepayAmount("")
        } catch (err) {
            console.error("Failed to repay:", err);
            setError(`Failed to repay: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false)
        }
    }

    const handleLend = async () => {
        if (!lendAmount || Number(lendAmount) <= 0) {
            setError("Please enter a valid amount to lend")
            return
        }
        if (!account) {
            setError("Please connect your wallet to lend")
            return
        }
        try {
            setIsLoading(true)
            setError("") // Clear previous errors

            // Send native tokens to the contract address to trigger the receive function
            const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
            const tx = await signer.sendTransaction({
                to: contract.target, // Contract address
                value: ethers.parseEther(lendAmount) // Amount in native token units
            });

            // Wait for transaction to be mined
            const receipt = await tx.wait();
            console.log("Transaction confirmed:", receipt);

            // Add a small delay to ensure the contract state is updated
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Refresh the data
            await fetchData();

            setError("Tokens lent successfully!"); // Success message
            setLendAmount("");

        } catch (err) {
            console.error("Failed to lend tokens:", err);
            setError(`Failed to lend tokens: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
        }
    }

    if (mode === 'lend') {
        return (
            <div className="space-y-6 w-full">
                {error && (
                    <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Card className="bg-gradient-to-br from-background to-muted/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Liquidity Provision Overview
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">Total native tokens in the pool (from lending and repayments)</p>
                        {/* TODO: Fetch and display actual total pool balance */}
                        <p className="text-2xl font-bold">{totalLent} {tokenSymbol || 'ETH'}</p>
                        {/* APY is not directly trackable for individual contributions via receive() */}
                        {/* <div className="p-4 rounded-lg bg-background/50 border>
                                <p className="text-sm text-muted-foreground">Current APY</p>
                                <p className="text-2xl font-bold">{lendingAPY}%</p>
                            </div> */}
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-background to-muted/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ArrowUpDown className="h-5 w-5" />
                            Provide Liquidity (Lend Native Tokens)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <p className="text-sm text-muted-foreground">Send native testnet tokens to the pool contract address to provide liquidity.</p>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Amount (Native Token)</label>
                            <Input
                                type="number"
                                placeholder="Enter amount to lend"
                                value={lendAmount}
                                onChange={(e) => {
                                    setLendAmount(e.target.value)
                                    setError("")
                                }}
                                min="0"
                                step="0.01"
                                className="w-full"
                            />
                        </div>

                        <Button
                            onClick={handleLend}
                            className="w-full h-12"
                            disabled={isLoading || !account}
                        >
                            {isLoading ? "Processing..." : "Lend Native Tokens"}
                        </Button>
                        {/* Removed Withdraw button */}
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">User Dashboard</h2>
                {/* Wallet connection is now handled in App.jsx header */}
                {/* <Button variant="outline" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Connect Wallet
                </Button> */}
            </div>

            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Portfolio Overview */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Portfolio Overview
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Total Collateral Value</p>
                            <p className="text-2xl font-bold">${totalCollateralValue}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Current Debt</p>
                            <p className="text-2xl font-bold">${userDebt}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Credit Score</p>
                            <div className="flex items-center gap-2">
                                <p className="text-2xl font-bold">{creditScore !== null ? creditScore : 'N/A'}</p>
                                <Button
                                    onClick={refreshCreditScore}
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                >
                                    <ArrowUpDown className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 rounded-lg bg-background/50 border">
                        <div className="flex justify-between mb-2">
                            <p className="text-sm text-muted-foreground">Health Ratio</p>
                            <p className="text-sm font-medium">{healthStatus.ratio.toFixed(2)}%</p>
                        </div>
                        <Progress value={healthStatus.ratio} className="h-2" />
                        <p className="text-sm mt-2">
                            Status: {healthStatus.isHealthy ? "✅ Healthy" : "⚠️ At Risk"}
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="collateral" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="collateral">Collateral</TabsTrigger>
                    <TabsTrigger value="borrow">Borrow</TabsTrigger>
                    <TabsTrigger value="repay">Repay</TabsTrigger>
                </TabsList>

                <TabsContent value="collateral">
                    <Card className="bg-gradient-to-br from-background to-muted/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Collateral Management
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Select Token</label>
                                <Select
                                    value={selectedToken}
                                    onValueChange={(value) => {
                                        setSelectedToken(value)
                                        setError("")
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select a token" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COLLATERAL_TOKENS.map((token) => (
                                            <SelectItem key={token.address} value={token.address}>
                                                {token.name} ({token.symbol})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedToken && ( // Only show token info if a token is selected
                                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-background/50 border">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Token Balance</p>
                                        {/* TODO: Fetch and display actual token balance */}
                                        <p className="text-lg font-medium">{tokenBalance} {COLLATERAL_TOKENS.find(t => t.address === selectedToken)?.symbol}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Current Value</p>
                                        {/* TODO: Fetch and display actual token value */}
                                        <p className="text-lg font-medium">${tokenValue}</p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Amount</label>
                                <Input
                                    type="number"
                                    placeholder="Enter amount to deposit/withdraw"
                                    value={collateralAmount}
                                    onChange={(e) => {
                                        setCollateralAmount(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <div className="flex gap-4">
                                <Button
                                    onClick={handleDepositCollateral}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Processing..." : "Deposit"}
                                </Button>
                                <Button
                                    onClick={handleWithdrawCollateral}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                    variant="outline"
                                >
                                    {isLoading ? "Processing..." : "Withdraw"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="borrow">
                    <Card className="bg-gradient-to-br from-background to-muted/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ArrowUpDown className="h-5 w-5" />
                                Borrow
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Amount to Borrow</label>
                                <Input
                                    type="number"
                                    placeholder="Enter amount to borrow"
                                    value={borrowAmount}
                                    onChange={(e) => {
                                        setBorrowAmount(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleBorrow}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Borrow"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="repay">
                    <Card className="bg-gradient-to-br from-background to-muted/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ArrowDownUp className="h-5 w-5" />
                                Repay
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Amount to Repay</label>
                                <Input
                                    type="number"
                                    placeholder="Enter amount to repay"
                                    value={repayAmount}
                                    onChange={(e) => {
                                        setRepayAmount(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleRepay}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Repay"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>

            {/* Health Check Section */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Health Check
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        onClick={handleHealthCheck}
                        className="w-full h-12"
                        disabled={isLoading || !account}
                    >
                        {isLoading ? "Checking..." : "Check Health Status"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
} 