import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, AlertTriangle, DollarSign, Clock, UserPlus } from "lucide-react"
import { Contract } from "ethers"

interface LiquidatorPanelProps {
    contract: Contract;
    account: string | null;
}

export function LiquidatorPanel({ contract, account }: LiquidatorPanelProps) {
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [recoveryToken, setRecoveryToken] = useState("")
    const [recoveryAmount, setRecoveryAmount] = useState("")
    const [timeRemaining, setTimeRemaining] = useState<string | null>(null)
    const [debtAmount, setDebtAmount] = useState<string | null>(null)
    const [collateralInfo, setCollateralInfo] = useState<{ token: string, amount: string }[]>([])
    const [targetUser, setTargetUser] = useState("")
    const [currentLiquidator, setCurrentLiquidator] = useState<string | null>(null)
    const [newLiquidator, setNewLiquidator] = useState("")

    useEffect(() => {
        if (contract) {
            fetchCurrentLiquidator()
        }
    }, [contract])

    useEffect(() => {
        if (contract && targetUser) {
            fetchLiquidationInfo()
        }
    }, [contract, targetUser])

    const fetchCurrentLiquidator = async () => {
        try {
            const liquidator = await contract.liquidator()
            setCurrentLiquidator(liquidator)
        } catch (err) {
            setCurrentLiquidator(null)
        }
    }

    const fetchLiquidationInfo = async () => {
        if (!targetUser) return;
        try {
            const [isLiquidatable, liquidationStartTime, debt] = await Promise.all([
                contract.isLiquidatable(targetUser),
                contract.liquidationStartTime(targetUser),
                contract.userDebt(targetUser)
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
            } else {
                setTimeRemaining(null)
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

    const handleSetLiquidator = async () => {
        if (!newLiquidator) return setError("Please enter a liquidator address")
        try {
            setIsLoading(true)
            const tx = await contract.setLiquidator(newLiquidator)
            await tx.wait()
            setNewLiquidator("")
            await fetchCurrentLiquidator()
            setError("")
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to set liquidator")
        } finally {
            setIsLoading(false)
        }
    }

    const handleStartLiquidation = async () => {
        if (!targetUser) return setError("Please enter a user address")
        try {
            setIsLoading(true)
            const tx = await contract.startLiquidation(targetUser)
            await tx.wait()
            setError("Liquidation started successfully!")
            await fetchLiquidationInfo()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start liquidation")
        } finally {
            setIsLoading(false)
        }
    }

    const handleExecuteLiquidation = async () => {
        if (!targetUser) return setError("Please enter a user address")
        try {
            setIsLoading(true)
            const tx = await contract.executeLiquidation(targetUser)
            await tx.wait()
            setError("Liquidation executed successfully!")
            await fetchLiquidationInfo()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to execute liquidation")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Liquidation Controls
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {currentLiquidator && (
                        <div className="p-4 bg-muted rounded-lg">
                            <p className="text-sm font-medium">Current Liquidator: {currentLiquidator}</p>
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">New Liquidator Address</label>
                        <Input
                            placeholder="Enter liquidator address"
                            value={newLiquidator}
                            onChange={(e) => setNewLiquidator(e.target.value)}
                            className="w-full"
                        />
                        <Button
                            onClick={handleSetLiquidator}
                            className="w-full h-12"
                            disabled={isLoading}
                        >
                            {isLoading ? "Processing..." : "Set Liquidator"}
                        </Button>
                    </div>

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

                    <div className="flex gap-4">
                        <Button
                            onClick={handleStartLiquidation}
                            className="flex-1 h-12"
                            disabled={isLoading}
                        >
                            {isLoading ? "Processing..." : "Start Liquidation"}
                        </Button>
                        <Button
                            onClick={handleExecuteLiquidation}
                            className="flex-1 h-12"
                            disabled={isLoading}
                        >
                            {isLoading ? "Processing..." : "Execute Liquidation"}
                        </Button>
                    </div>

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
                                Amount to Repay: {debtAmount} SONIC
                            </p>
                        </div>
                    )}

                    {collateralInfo.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium">User Collateral</h3>
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
        </div>
    )
} 