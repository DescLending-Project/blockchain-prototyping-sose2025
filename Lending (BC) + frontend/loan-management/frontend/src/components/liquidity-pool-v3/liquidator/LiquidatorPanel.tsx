import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, AlertTriangle, DollarSign } from "lucide-react"
import { Contract } from "ethers"

interface LiquidatorPanelProps {
    contract: Contract;
    account: string | null;
}

export function LiquidatorPanel({ contract, account }: LiquidatorPanelProps) {
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [targetUser, setTargetUser] = useState("")
    const [liquidationAmount, setLiquidationAmount] = useState("")
    const [liquidatableUsers, setLiquidatableUsers] = useState<string[]>([])

    useEffect(() => {
        fetchLiquidatableUsers()
    }, [contract])

    const fetchLiquidatableUsers = async () => {
        try {
            // TODO: Implement fetching of liquidatable users
            setLiquidatableUsers([])
        } catch (err) {
            console.error("Failed to fetch liquidatable users:", err)
        }
    }

    const handleLiquidate = async () => {
        if (!targetUser) {
            setError("Please select a user to liquidate")
            return
        }
        if (!liquidationAmount || Number(liquidationAmount) <= 0) {
            setError("Please enter a valid liquidation amount")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.liquidate(targetUser, ethers.parseEther(liquidationAmount))
            await tx.wait()
            await fetchLiquidatableUsers()
            setTargetUser("")
            setLiquidationAmount("")
        } catch (err) {
            setError("Failed to liquidate position")
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
                        Liquidation Panel
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Select User to Liquidate</label>
                        <Input
                            placeholder="Enter user address"
                            value={targetUser}
                            onChange={(e) => {
                                setTargetUser(e.target.value)
                                setError("")
                            }}
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Liquidation Amount</label>
                        <Input
                            type="number"
                            placeholder="Enter amount to liquidate"
                            value={liquidationAmount}
                            onChange={(e) => {
                                setLiquidationAmount(e.target.value)
                                setError("")
                            }}
                            min="0"
                            step="0.01"
                            className="w-full"
                        />
                    </div>

                    <Button
                        onClick={handleLiquidate}
                        className="w-full h-12"
                        disabled={isLoading}
                    >
                        {isLoading ? "Processing..." : "Liquidate Position"}
                    </Button>

                    {liquidatableUsers.length > 0 && (
                        <div className="mt-6">
                            <h3 className="text-lg font-medium mb-4">Liquidatable Positions</h3>
                            <div className="space-y-2">
                                {liquidatableUsers.map((user) => (
                                    <div
                                        key={user}
                                        className="p-4 rounded-lg bg-background/50 border flex items-center justify-between"
                                    >
                                        <span className="font-mono text-sm">{user}</span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setTargetUser(user)}
                                        >
                                            Select
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
} 