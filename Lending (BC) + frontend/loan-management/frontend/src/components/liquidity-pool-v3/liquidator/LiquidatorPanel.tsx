import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"

export function LiquidatorPanel() {
    const [targetUser, setTargetUser] = useState("")

    const handleStartLiquidation = async () => {
        // TODO: Implement contract interaction
    }

    const handleExecuteLiquidation = async () => {
        // TODO: Implement contract interaction
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Liquidator Controls</h2>

            <Card>
                <CardHeader>
                    <CardTitle>Liquidation Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Target User Address</label>
                            <Input
                                placeholder="Enter user address"
                                value={targetUser}
                                onChange={(e) => setTargetUser(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-4">
                            <Button
                                onClick={handleStartLiquidation}
                                className="flex-1"
                                variant="outline"
                            >
                                Start Liquidation
                            </Button>
                            <Button
                                onClick={handleExecuteLiquidation}
                                className="flex-1"
                                variant="destructive"
                            >
                                Execute Liquidation
                            </Button>
                        </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                        <p>⚠️ Warning: Only execute liquidation on users with unhealthy positions.</p>
                        <p>Make sure to verify the user's health status before proceeding.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 