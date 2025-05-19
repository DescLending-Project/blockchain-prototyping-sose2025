import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, Settings, Coins, Shield } from "lucide-react"

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

export function AdminPanel() {
    const [priceFeedForm, setPriceFeedForm] = useState({
        token: "",
        feed: ""
    })

    const [thresholdForm, setThresholdForm] = useState({
        token: "",
        threshold: ""
    })

    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const handlePriceFeedSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!priceFeedForm.token) {
            setError("Please select a token")
            return
        }
        if (!priceFeedForm.feed) {
            setError("Please enter a price feed address")
            return
        }
        try {
            setIsLoading(true)
            // TODO: Implement contract interaction
            setPriceFeedForm({ token: "", feed: "" })
        } catch (err) {
            setError("Failed to set price feed")
        } finally {
            setIsLoading(false)
        }
    }

    const handleThresholdSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!thresholdForm.token) {
            setError("Please select a token")
            return
        }
        if (!thresholdForm.threshold || Number(thresholdForm.threshold) <= 0) {
            setError("Please enter a valid threshold")
            return
        }
        try {
            setIsLoading(true)
            // TODO: Implement contract interaction
            setThresholdForm({ token: "", threshold: "" })
        } catch (err) {
            setError("Failed to set liquidation threshold")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Admin Controls</h2>
                <Button variant="outline" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Admin Settings
                </Button>
            </div>

            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Token Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                    <form onSubmit={handlePriceFeedSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                Set Price Feed
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Configure the Chainlink price feed for each token
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Select Token</label>
                                <Select
                                    value={priceFeedForm.token}
                                    onValueChange={(value) => {
                                        setPriceFeedForm(prev => ({ ...prev, token: value }))
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
                                <label className="text-sm font-medium">Price Feed Address</label>
                                <Input
                                    placeholder="Enter Chainlink price feed address (e.g., 0x1234...)"
                                    value={priceFeedForm.feed}
                                    onChange={(e) => {
                                        setPriceFeedForm(prev => ({ ...prev, feed: e.target.value }))
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                                <p className="text-sm text-muted-foreground">
                                    This should be a valid Chainlink price feed address for the selected token
                                </p>
                            </div>
                        </div>
                        <Button
                            type="submit"
                            className="w-full h-12"
                            disabled={isLoading}
                        >
                            {isLoading ? "Setting..." : "Set Price Feed"}
                        </Button>
                    </form>

                    <div className="h-px bg-border" />

                    <form onSubmit={handleThresholdSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                Set Liquidation Threshold
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Configure the minimum collateral ratio required before liquidation
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Select Token</label>
                                <Select
                                    value={thresholdForm.token}
                                    onValueChange={(value) => {
                                        setThresholdForm(prev => ({ ...prev, token: value }))
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
                                <label className="text-sm font-medium">Liquidation Threshold</label>
                                <Input
                                    type="number"
                                    placeholder="Enter threshold percentage (e.g., 130 for 130%)"
                                    value={thresholdForm.threshold}
                                    onChange={(e) => {
                                        setThresholdForm(prev => ({ ...prev, threshold: e.target.value }))
                                        setError("")
                                    }}
                                    min="100"
                                    step="1"
                                    className="w-full"
                                />
                                <p className="text-sm text-muted-foreground">
                                    The minimum collateral ratio required before liquidation can occur (e.g., 130 means 130%)
                                </p>
                            </div>
                        </div>
                        <Button
                            type="submit"
                            className="w-full h-12"
                            disabled={isLoading}
                        >
                            {isLoading ? "Setting..." : "Set Threshold"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
} 