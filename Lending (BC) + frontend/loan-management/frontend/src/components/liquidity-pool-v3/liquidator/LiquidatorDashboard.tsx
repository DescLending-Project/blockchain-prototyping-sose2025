import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, AlertTriangle, DollarSign, Clock, Shield, Target } from "lucide-react"
import { Contract } from "ethers"

interface LiquidatorDashboardProps {
    contract: Contract;
    account: string | null;
}

export function LiquidatorDashboard({ contract, account }: LiquidatorDashboardProps) {
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [recoveryToken, setRecoveryToken] = useState("")
    const [recoveryAmount, setRecoveryAmount] = useState("")
    const [timeRemaining, setTimeRemaining] = useState<string | null>(null)
    const [debtAmount, setDebtAmount] = useState<string | null>(null)
    const [collateralInfo, setCollateralInfo] = useState<{ token: string, amount: string }[]>([])
    const [targetUser, setTargetUser] = useState("")
    const [liquidationThreshold, setLiquidationThreshold] = useState("0")

    useEffect(() => {
        if (contract) {
            fetchLiquidationThreshold()
        }
    }, [contract])

    useEffect(() => {
        if (contract && targetUser) {
            fetchLiquidationInfo()
        }
    }, [contract, targetUser])

    const fetchLiquidationThreshold = async () => {
        try {
            const threshold = await contract.LIQUIDATION_THRESHOLD();
            setLiquidationThreshold(ethers.formatUnits(threshold, 0));
        } catch (err) {
            console.error("Failed to fetch liquidation threshold:", err)
        }
    }

    const fetchLiquidationInfo = async () => {
        if (!targetUser) return;

        try {
            const [isLiquidatable, liquidationStartTime, debt, collateral] = await Promise.all([
                contract.isLiquidatable(targetUser),
                contract.liquidationStartTime(targetUser),
                contract.userDebt(targetUser),
                contract.getCollateral(targetUser, recoveryToken)
            ])

            if (isLiquidatable) {
                const startTime = Number(liquidationStartTime)
                const gracePeriod = await contract.GRACE_PERIOD()
                const endTime = startTime + Number(gracePeriod)
                const now = Math.floor(Date.now() / 1000)
                const remaining = endTime - now

                if (remaining > 0) {
                    const hours = Math.floor(remaining / 3600)
                    const minutes = Math.floor((remaining % 3600) / 60)
                    setTimeRemaining(`${hours}h ${minutes}m`)
                } else {
                    setTimeRemaining("Grace period ended")
                }
            }

            setDebtAmount(ethers.formatEther(debt))
            // Fetch collateral info for all allowed tokens
            const allowedTokens = await contract.getAllowedCollateralTokens()
            const collateralData = await Promise.all(
                allowedTokens.map(async (token: string) => {
                    const amount = await contract.getCollateral(targetUser, token)
                    return {
                        token,
                        amount: ethers.formatEther(amount)
                    }
                })
            )
            setCollateralInfo(collateralData.filter(info => Number(info.amount) > 0))
        } catch (err) {
            console.error("Failed to fetch liquidation info:", err)
            setError("Failed to fetch liquidation info. Please check the target user address.")
        }
    }

    const handleRecoverFromLiquidation = async () => {
        if (!recoveryToken) {
            setError("Please select a token")
            return
        }
        if (!recoveryAmount || Number(recoveryAmount) <= 0) {
            setError("Please enter a valid amount")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.recoverFromLiquidation(
                recoveryToken,
                ethers.parseEther(recoveryAmount)
            )
            await tx.wait()
            await fetchLiquidationInfo()
            setRecoveryToken("")
            setRecoveryAmount("")
            setError("Recovery successful!")
        } catch (err) {
            console.error("Failed to recover from liquidation:", err)
            setError(err instanceof Error ? err.message : "Failed to recover from liquidation")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Liquidator Dashboard</h2>
            </div>

            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Liquidation Threshold */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Liquidation Threshold
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 rounded-lg bg-background/50 border">
                        <p className="text-sm text-muted-foreground">Current Liquidation Threshold</p>
                        <p className="text-2xl font-bold">{liquidationThreshold}%</p>
                        <p className="text-sm text-muted-foreground mt-2">
                            Positions with a health ratio below this threshold can be liquidated.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Liquidation Recovery */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Liquidation Recovery
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {timeRemaining && (
                        <div className="p-4 bg-muted rounded-lg flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <p className="text-sm font-medium">
                                Time Remaining: {timeRemaining}
                            </p>
                        </div>
                    )}

                    {debtAmount && (
                        <div className="p-4 bg-muted rounded-lg">
                            <p className="text-sm font-medium">
                                Amount to Repay: {debtAmount} ETH
                            </p>
                        </div>
                    )}

                    {collateralInfo.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium">Available Collateral</h3>
                            {collateralInfo.map((info) => (
                                <div key={info.token} className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">
                                        Token: {info.token}
                                    </p>
                                    <p className="text-sm">
                                        Amount: {info.amount}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Target User Address</label>
                            <Input
                                placeholder="Enter target user address"
                                value={targetUser}
                                onChange={(e) => {
                                    setTargetUser(e.target.value)
                                    setError("")
                                }}
                                className="w-full"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Token to Recover</label>
                            <Input
                                placeholder="Enter token address"
                                value={recoveryToken}
                                onChange={(e) => {
                                    setRecoveryToken(e.target.value)
                                    setError("")
                                }}
                                className="w-full"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Amount to Recover</label>
                            <Input
                                type="number"
                                placeholder="Enter amount to recover"
                                value={recoveryAmount}
                                onChange={(e) => {
                                    setRecoveryAmount(e.target.value)
                                    setError("")
                                }}
                                min="0"
                                step="0.01"
                                className="w-full"
                            />
                        </div>

                        <Button
                            onClick={handleRecoverFromLiquidation}
                            className="w-full h-12"
                            disabled={isLoading}
                        >
                            {isLoading ? "Processing..." : "Recover from Liquidation"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Liquidation Information */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        How Liquidation Works
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium mt-0.5">
                                1
                            </div>
                            <div>
                                <p className="font-medium">Monitor Positions</p>
                                <p className="text-sm text-muted-foreground">
                                    Monitor user positions that fall below the liquidation threshold.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium mt-0.5">
                                2
                            </div>
                            <div>
                                <p className="font-medium">Grace Period</p>
                                <p className="text-sm text-muted-foreground">
                                    Users have a grace period to improve their position before liquidation.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium mt-0.5">
                                3
                            </div>
                            <div>
                                <p className="font-medium">Recover Collateral</p>
                                <p className="text-sm text-muted-foreground">
                                    Liquidators can recover collateral by repaying the user's debt.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 