import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, Wallet, Coins, Shield, AlertTriangle } from "lucide-react"

// Token configurations
const COLLATERAL_TOKENS = [
    {
        address: "0x524C5F657533e3E8Fc0Ee137eB605a1d4FFE4D7D",
        symbol: "CORAL",
        name: "Coral Token"
    },
    {
        address: "0x1234567890123456789012345678901234567890",
        symbol: "GLINT",
        name: "Glint Token"
    }
];

export function UserPanel() {
    const [isLiquidatable, setIsLiquidatable] = useState(false)
    const [recoveryForm, setRecoveryForm] = useState({
        token: "",
        amount: ""
    })
    const [selectedToken, setSelectedToken] = useState("")
    const [tokenBalance, setTokenBalance] = useState("0")
    const [collateralAmount, setCollateralAmount] = useState("")
    const [tokenValue, setTokenValue] = useState("0")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (selectedToken) {
            fetchTokenBalance()
            fetchTokenValue()
        }
    }, [selectedToken])

    const fetchTokenBalance = async () => {
        try {
            setIsLoading(true)
            // TODO: Implement token balance fetching
            setTokenBalance("0")
        } catch (err) {
            setError("Failed to fetch token balance")
        } finally {
            setIsLoading(false)
        }
    }

    const fetchTokenValue = async () => {
        try {
            setIsLoading(true)
            // TODO: Implement token value fetching
            setTokenValue("0")
        } catch (err) {
            setError("Failed to fetch token value")
        } finally {
            setIsLoading(false)
        }
    }

    const handleHealthCheck = async () => {
        try {
            setIsLoading(true)
            // TODO: Implement contract interaction
        } catch (err) {
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
        try {
            setIsLoading(true)
            // TODO: Implement contract interaction
        } catch (err) {
            setError("Failed to deposit collateral")
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
        try {
            setIsLoading(true)
            // TODO: Implement contract interaction
        } catch (err) {
            setError("Failed to withdraw collateral")
        } finally {
            setIsLoading(false)
        }
    }

    const handleRecoverySubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!recoveryForm.token) {
            setError("Please select a token first")
            return
        }
        if (!recoveryForm.amount || Number(recoveryForm.amount) <= 0) {
            setError("Please enter a valid amount")
            return
        }
        try {
            setIsLoading(true)
            // TODO: Implement contract interaction
        } catch (err) {
            setError("Failed to recover from liquidation")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">User Dashboard</h2>
                <Button variant="outline" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Connect Wallet
                </Button>
            </div>

            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Portfolio Section */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Portfolio Overview
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Total Collateral Value</p>
                            <p className="text-2xl font-bold">$0.00</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Minimum Collateral Ratio</p>
                            <p className="text-2xl font-bold">0%</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Collateral Management Section */}
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
                        disabled={isLoading}
                    >
                        {isLoading ? "Checking..." : "Check Health Status"}
                    </Button>
                    <div className="text-center p-4 rounded-lg bg-background/50 border">
                        <p className="text-sm text-muted-foreground">Current Status:</p>
                        <p className="text-lg font-medium">
                            {isLiquidatable ? "⚠️ Risky" : "✅ Healthy"}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Liquidation Recovery Section */}
            {isLiquidatable && (
                <Card className="bg-gradient-to-br from-background to-muted/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Recover from Liquidation
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleRecoverySubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Select Token</label>
                                <Select
                                    value={recoveryForm.token}
                                    onValueChange={(value) => {
                                        setRecoveryForm(prev => ({ ...prev, token: value }))
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

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Amount</label>
                                <Input
                                    type="number"
                                    placeholder="Enter amount to recover"
                                    value={recoveryForm.amount}
                                    onChange={(e) => {
                                        setRecoveryForm(prev => ({ ...prev, amount: e.target.value }))
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Recover"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}
        </div>
    )
} 