import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, Settings, Users, DollarSign, Percent, Shield, Key, UserPlus, UserCog, Clock, Timer, AlertTriangle, Coins, ArrowUpDown } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Contract } from "ethers"

interface AdminPanelProps {
    contract: Contract;
    account: string | null;
}

export function AdminPanel({ contract, account }: AdminPanelProps) {
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [selectedUser, setSelectedUser] = useState("")
    const [creditScore, setCreditScore] = useState("")
    const [liquidationThreshold, setLiquidationThreshold] = useState("")
    const [selectedToken, setSelectedToken] = useState("")
    const [priceFeedAddress, setPriceFeedAddress] = useState("")
    const [newLiquidator, setNewLiquidator] = useState("")
    const [newAdmin, setNewAdmin] = useState("")
    const [newCollateralToken, setNewCollateralToken] = useState("")
    const [interestRate, setInterestRate] = useState("")
    const [maxBorrowAmount, setMaxBorrowAmount] = useState("")
    const [maxCollateralAmount, setMaxCollateralAmount] = useState("")
    const [maxLiquidationBonus, setMaxLiquidationBonus] = useState("")
    const [maxLiquidationPenalty, setMaxLiquidationPenalty] = useState("")
    const [maxLiquidationThreshold, setMaxLiquidationThreshold] = useState("")
    const [maxLiquidationTime, setMaxLiquidationTime] = useState("")
    const [maxLiquidationAmount, setMaxLiquidationAmount] = useState("")
    const [maxLiquidationRatio, setMaxLiquidationRatio] = useState("")
    const [maxLiquidationDelay, setMaxLiquidationDelay] = useState("")
    const [maxLiquidationGracePeriod, setMaxLiquidationGracePeriod] = useState("")
    const [extractAmount, setExtractAmount] = useState("")

    const handleSetCreditScore = async () => {
        if (!selectedUser) {
            setError("Please select a user")
            return
        }
        if (!creditScore || Number(creditScore) < 0 || Number(creditScore) > 100) {
            setError("Please enter a valid credit score (0-100)")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setCreditScore(selectedUser, Number(creditScore))
            await tx.wait()
            setCreditScore("")
            setSelectedUser("")
        } catch (err) {
            setError("Failed to set credit score")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetLiquidationThreshold = async () => {
        if (!selectedToken) {
            setError("Please select a token")
            return
        }
        if (!liquidationThreshold || Number(liquidationThreshold) <= 0) {
            setError("Please enter a valid liquidation threshold")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setLiquidationThreshold(selectedToken, ethers.parseUnits(liquidationThreshold, 18))
            await tx.wait()
            setLiquidationThreshold("")
            setSelectedToken("")
        } catch (err) {
            setError("Failed to set liquidation threshold")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetPriceFeed = async () => {
        if (!selectedToken) {
            setError("Please select a token")
            return
        }
        if (!priceFeedAddress) {
            setError("Please enter a price feed address")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setPriceFeed(selectedToken, priceFeedAddress)
            await tx.wait()
            setPriceFeedAddress("")
            setSelectedToken("")
        } catch (err) {
            setError("Failed to set price feed")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetLiquidator = async () => {
        if (!newLiquidator) {
            setError("Please enter a liquidator address")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setLiquidator(newLiquidator)
            await tx.wait()
            setNewLiquidator("")
        } catch (err) {
            setError("Failed to set liquidator")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetAdmin = async () => {
        if (!newAdmin) {
            setError("Please enter an admin address")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setAdmin(newAdmin)
            await tx.wait()
            setNewAdmin("")
        } catch (err) {
            setError("Failed to set admin")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetCollateralToken = async () => {
        if (!newCollateralToken) {
            setError("Please enter a token address")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setCollateralToken(newCollateralToken, true)
            await tx.wait()
            setNewCollateralToken("")
        } catch (err) {
            setError("Failed to set collateral token")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetInterestRate = async () => {
        if (!interestRate || Number(interestRate) < 0) {
            setError("Please enter a valid interest rate")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setInterestRate(ethers.parseUnits(interestRate, 18))
            await tx.wait()
            setInterestRate("")
        } catch (err) {
            setError("Failed to set interest rate")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxBorrowAmount = async () => {
        if (!maxBorrowAmount || Number(maxBorrowAmount) <= 0) {
            setError("Please enter a valid max borrow amount")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxBorrowAmount(ethers.parseUnits(maxBorrowAmount, 18))
            await tx.wait()
            setMaxBorrowAmount("")
        } catch (err) {
            setError("Failed to set max borrow amount")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxCollateralAmount = async () => {
        if (!maxCollateralAmount || Number(maxCollateralAmount) <= 0) {
            setError("Please enter a valid max collateral amount")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxCollateralAmount(ethers.parseUnits(maxCollateralAmount, 18))
            await tx.wait()
            setMaxCollateralAmount("")
        } catch (err) {
            setError("Failed to set max collateral amount")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationBonus = async () => {
        if (!maxLiquidationBonus || Number(maxLiquidationBonus) < 0) {
            setError("Please enter a valid max liquidation bonus")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationBonus(ethers.parseUnits(maxLiquidationBonus, 18))
            await tx.wait()
            setMaxLiquidationBonus("")
        } catch (err) {
            setError("Failed to set max liquidation bonus")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationPenalty = async () => {
        if (!maxLiquidationPenalty || Number(maxLiquidationPenalty) < 0) {
            setError("Please enter a valid max liquidation penalty")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationPenalty(ethers.parseUnits(maxLiquidationPenalty, 18))
            await tx.wait()
            setMaxLiquidationPenalty("")
        } catch (err) {
            setError("Failed to set max liquidation penalty")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationThreshold = async () => {
        if (!maxLiquidationThreshold || Number(maxLiquidationThreshold) <= 0) {
            setError("Please enter a valid max liquidation threshold")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationThreshold(ethers.parseUnits(maxLiquidationThreshold, 18))
            await tx.wait()
            setMaxLiquidationThreshold("")
        } catch (err) {
            setError("Failed to set max liquidation threshold")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationTime = async () => {
        if (!maxLiquidationTime || Number(maxLiquidationTime) <= 0) {
            setError("Please enter a valid max liquidation time")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationTime(Number(maxLiquidationTime))
            await tx.wait()
            setMaxLiquidationTime("")
        } catch (err) {
            setError("Failed to set max liquidation time")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationAmount = async () => {
        if (!maxLiquidationAmount || Number(maxLiquidationAmount) <= 0) {
            setError("Please enter a valid max liquidation amount")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationAmount(ethers.parseUnits(maxLiquidationAmount, 18))
            await tx.wait()
            setMaxLiquidationAmount("")
        } catch (err) {
            setError("Failed to set max liquidation amount")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationRatio = async () => {
        if (!maxLiquidationRatio || Number(maxLiquidationRatio) <= 0) {
            setError("Please enter a valid max liquidation ratio")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationRatio(ethers.parseUnits(maxLiquidationRatio, 18))
            await tx.wait()
            setMaxLiquidationRatio("")
        } catch (err) {
            setError("Failed to set max liquidation ratio")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationDelay = async () => {
        if (!maxLiquidationDelay || Number(maxLiquidationDelay) <= 0) {
            setError("Please enter a valid max liquidation delay")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationDelay(Number(maxLiquidationDelay))
            await tx.wait()
            setMaxLiquidationDelay("")
        } catch (err) {
            setError("Failed to set max liquidation delay")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSetMaxLiquidationGracePeriod = async () => {
        if (!maxLiquidationGracePeriod || Number(maxLiquidationGracePeriod) <= 0) {
            setError("Please enter a valid max liquidation grace period")
            return
        }
        try {
            setIsLoading(true)
            const tx = await contract.setMaxLiquidationGracePeriod(Number(maxLiquidationGracePeriod))
            await tx.wait()
            setMaxLiquidationGracePeriod("")
        } catch (err) {
            setError("Failed to set max liquidation grace period")
        } finally {
            setIsLoading(false)
        }
    }

    const handleExtractFunds = async () => {
        if (!extractAmount || Number(extractAmount) <= 0) {
            setError("Please enter a valid amount to extract")
            return
        }
        try {
            setIsLoading(true)
            // Get a signer from the provider
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()
            // Create a new contract instance with the signer
            const contractWithSigner = contract.connect(signer)

            const tx = await contractWithSigner.extract(ethers.parseEther(extractAmount))
            await tx.wait()
            setExtractAmount("")
            setError("Funds extracted successfully!")
        } catch (err) {
            console.error("Failed to extract funds:", err)
            setError("Failed to extract funds")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 w-full">
            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Tabs defaultValue="credit" className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-1">
                    <TabsTrigger value="credit">Credit Score</TabsTrigger>
                    <TabsTrigger value="threshold">Liquidation</TabsTrigger>
                    <TabsTrigger value="price">Price Feed</TabsTrigger>
                    <TabsTrigger value="collateral">Collateral</TabsTrigger>
                    <TabsTrigger value="liquidator">Liquidator</TabsTrigger>
                    <TabsTrigger value="admin">Admin</TabsTrigger>
                    <TabsTrigger value="interest">Interest</TabsTrigger>
                    <TabsTrigger value="limits">Limits</TabsTrigger>
                    <TabsTrigger value="funds">Funds</TabsTrigger>
                </TabsList>

                <TabsContent value="credit">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Set User Credit Score
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">User Address</label>
                                <Input
                                    placeholder="Enter user address"
                                    value={selectedUser}
                                    onChange={(e) => {
                                        setSelectedUser(e.target.value)
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Credit Score (0-100)</label>
                                <Input
                                    type="number"
                                    placeholder="Enter credit score"
                                    value={creditScore}
                                    onChange={(e) => {
                                        setCreditScore(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    max="100"
                                    step="1"
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleSetCreditScore}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Set Credit Score"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="threshold">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Set Liquidation Threshold
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Token Address</label>
                                <Input
                                    placeholder="Enter token address"
                                    value={selectedToken}
                                    onChange={(e) => {
                                        setSelectedToken(e.target.value)
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Threshold Value</label>
                                <Input
                                    type="number"
                                    placeholder="Enter liquidation threshold"
                                    value={liquidationThreshold}
                                    onChange={(e) => {
                                        setLiquidationThreshold(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleSetLiquidationThreshold}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Set Threshold"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="price">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5" />
                                Set Price Feed
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Token Address</label>
                                <Input
                                    placeholder="Enter token address"
                                    value={selectedToken}
                                    onChange={(e) => {
                                        setSelectedToken(e.target.value)
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Price Feed Address</label>
                                <Input
                                    placeholder="Enter price feed address"
                                    value={priceFeedAddress}
                                    onChange={(e) => {
                                        setPriceFeedAddress(e.target.value)
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleSetPriceFeed}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Set Price Feed"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="collateral">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                Set Collateral Token
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Token Address</label>
                                <Input
                                    placeholder="Enter token address"
                                    value={newCollateralToken}
                                    onChange={(e) => {
                                        setNewCollateralToken(e.target.value)
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleSetCollateralToken}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Set Collateral Token"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="liquidator">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5" />
                                Set Liquidator
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Liquidator Address</label>
                                <Input
                                    placeholder="Enter liquidator address"
                                    value={newLiquidator}
                                    onChange={(e) => {
                                        setNewLiquidator(e.target.value)
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleSetLiquidator}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Set Liquidator"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="admin">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserCog className="h-5 w-5" />
                                Set Admin
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Admin Address</label>
                                <Input
                                    placeholder="Enter admin address"
                                    value={newAdmin}
                                    onChange={(e) => {
                                        setNewAdmin(e.target.value)
                                        setError("")
                                    }}
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleSetAdmin}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Set Admin"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="interest">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Percent className="h-5 w-5" />
                                Set Interest Rate
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Interest Rate (%)</label>
                                <Input
                                    type="number"
                                    placeholder="Enter interest rate"
                                    value={interestRate}
                                    onChange={(e) => {
                                        setInterestRate(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleSetInterestRate}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Set Interest Rate"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="limits">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Coins className="h-5 w-5" />
                                Set Limits
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Max Borrow Amount</label>
                                <Input
                                    type="number"
                                    placeholder="Enter max borrow amount"
                                    value={maxBorrowAmount}
                                    onChange={(e) => {
                                        setMaxBorrowAmount(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Max Collateral Amount</label>
                                <Input
                                    type="number"
                                    placeholder="Enter max collateral amount"
                                    value={maxCollateralAmount}
                                    onChange={(e) => {
                                        setMaxCollateralAmount(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <div className="flex gap-4">
                                <Button
                                    onClick={handleSetMaxBorrowAmount}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Processing..." : "Set Max Borrow"}
                                </Button>
                                <Button
                                    onClick={handleSetMaxCollateralAmount}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Processing..." : "Set Max Collateral"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="funds">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Coins className="h-5 w-5" />
                                Extract Funds
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Amount (Native Token)</label>
                                <Input
                                    type="number"
                                    placeholder="Enter amount to extract"
                                    value={extractAmount}
                                    onChange={(e) => {
                                        setExtractAmount(e.target.value)
                                        setError("")
                                    }}
                                    min="0"
                                    step="0.01"
                                    className="w-full"
                                />
                            </div>

                            <Button
                                onClick={handleExtractFunds}
                                className="w-full h-12"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing..." : "Extract Funds"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
} 