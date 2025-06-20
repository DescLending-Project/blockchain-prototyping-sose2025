import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, Coins, Shield, AlertTriangle, ArrowUpDown, ArrowDownUp, Percent } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Contract } from "ethers"

interface UserDashboardProps {
    contract: Contract;
    account: string | null;
}

// Token configurations
const COLLATERAL_TOKENS = [
    {
        address: "0xAF93888cbD250300470A1618206e036E11470149",
        symbol: "CORAL",
        name: "Coral Token"
    },
    {
        address: "0xD4A89Be3D6e0be7f507819a57d7AA012C9Df3c63",
        symbol: "GLINT",
        name: "Glint Token"
    }
];

export function UserDashboard({ contract, account }: UserDashboardProps) {
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
    const [creditScore, setCreditScore] = useState<number | null>(null)

    const fetchData = async () => {
        if (!account) return
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)

            try {
                const debt = await contract.getMyDebt()
                setUserDebt(ethers.formatEther(debt))
            } catch (err) {
                console.error("Failed to fetch debt:", err)
                setUserDebt("0")
            }

            const totalCollateral = await readOnlyContract.getTotalCollateralValue(account);
            setTotalCollateralValue(ethers.formatUnits(totalCollateral, 18));

            const userCreditScore = await readOnlyContract.getCreditScore(account);
            setCreditScore(Number(userCreditScore));

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
    }, [contract, account])

    const fetchTokenBalance = async () => {
        if (!account || !selectedToken) return
        try {
            setIsLoading(true)
            const provider = new ethers.BrowserProvider(window.ethereum);
            const tokenContract = new ethers.Contract(selectedToken, ["function balanceOf(address owner) view returns (uint256)"], provider);
            const balance = await tokenContract.balanceOf(account);
            setTokenBalance(ethers.formatUnits(balance, 18));
        } catch (err) {
            setError("Failed to fetch token balance")
        } finally {
            setIsLoading(false)
        }
    }

    const fetchTokenValue = async () => {
        if (!account || !selectedToken) return
        try {
            setIsLoading(true)
            const provider = new ethers.BrowserProvider(window.ethereum);
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)
            const value = await readOnlyContract.getTokenValue(selectedToken);
            setTokenValue(ethers.formatUnits(value, 18));
        } catch (err) {
            console.error("Failed to fetch token value:", err);
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
            const provider = new ethers.BrowserProvider(window.ethereum)
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)
            const result = await readOnlyContract.checkCollateralization(account)

            if (result && Array.isArray(result) && result.length >= 2) {
                setHealthStatus({
                    isHealthy: result[0],
                    ratio: Number(ethers.formatUnits(result[1], 0))
                });
            } else {
                setError("Failed to parse health status result");
                setHealthStatus({ isHealthy: true, ratio: 0 });
            }

            setError("")

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
            setError("")
            const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
            const tokenContract = new ethers.Contract(selectedToken, ["function approve(address spender, uint256 amount) returns (bool)"], signer);
            const amountParsed = ethers.parseUnits(collateralAmount, 18);
            
            const approveTx = await tokenContract.approve(contract.target, amountParsed);
            await approveTx.wait();

            const depositTx = await contract.depositCollateral(selectedToken, amountParsed);
            await depositTx.wait();

            setCollateralAmount("")
            await fetchData()
            setError("Collateral deposited successfully!")
        } catch (err) {
            console.error("Failed to deposit collateral:", err)
            setError(err instanceof Error ? err.message : "Failed to deposit collateral")
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
            setError("")
            const amountParsed = ethers.parseUnits(collateralAmount, 18);
            const tx = await contract.withdrawCollateral(selectedToken, amountParsed);
            await tx.wait();
            setCollateralAmount("")
            await fetchData()
            setError("Collateral withdrawn successfully!")
        } catch (err) {
            console.error("Failed to withdraw collateral:", err)
            setError(err instanceof Error ? err.message : "Failed to withdraw collateral")
        } finally {
            setIsLoading(false)
        }
    }

    const handleBorrow = async () => {
        if (!borrowAmount || Number(borrowAmount) <= 0) {
            setError("Please enter a valid amount")
            return
        }
        if (!account) {
            setError("Please connect your wallet to borrow")
            return
        }
        try {
            setIsLoading(true)
            setError("")
            const amountParsed = ethers.parseEther(borrowAmount);
            const tx = await contract.borrow(amountParsed);
            await tx.wait();
            setBorrowAmount("")
            await fetchData()
            setError("Borrow successful!")
        } catch (err) {
            console.error("Failed to borrow:", err)
            setError(err instanceof Error ? err.message : "Failed to borrow")
        } finally {
            setIsLoading(false)
        }
    }

    const handleRepay = async () => {
        if (!repayAmount || Number(repayAmount) <= 0) {
            setError("Please enter a valid amount")
            return
        }
        if (!account) {
            setError("Please connect your wallet to repay")
            return
        }
        try {
            setIsLoading(true)
            setError("")
            const amountParsed = ethers.parseEther(repayAmount);
            const tx = await contract.repay({ value: amountParsed });
            await tx.wait();
            setRepayAmount("")
            await fetchData()
            setError("Repayment successful!")
        } catch (err) {
            console.error("Failed to repay:", err)
            setError(err instanceof Error ? err.message : "Failed to repay")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">User Dashboard</h2>
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

                            {selectedToken && (
                                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-background/50 border">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Token Balance</p>
                                        <p className="text-lg font-medium">{tokenBalance} {COLLATERAL_TOKENS.find(t => t.address === selectedToken)?.symbol}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Current Value</p>
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