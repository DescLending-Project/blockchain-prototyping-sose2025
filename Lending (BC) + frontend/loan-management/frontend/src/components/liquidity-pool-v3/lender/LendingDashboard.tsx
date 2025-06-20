import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, Shield, DollarSign, Percent, TrendingUp } from "lucide-react"
import { Contract } from "ethers"

interface LendingDashboardProps {
    contract: Contract;
    account: string | null;
}

export function LendingDashboard({ contract, account }: LendingDashboardProps) {
    const [lendAmount, setLendAmount] = useState("")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [lendingAPY, setLendingAPY] = useState("0")
    const [totalLent, setTotalLent] = useState("0")
    const [userLentAmount, setUserLentAmount] = useState("0")
    const [totalPoolBalance, setTotalPoolBalance] = useState("0")

    const fetchLendingData = async () => {
        if (!account) return
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const readOnlyContract = new ethers.Contract(contract.target, contract.interface, provider)

            // Fetch total pool balance
            const poolBalance = await readOnlyContract.getBalance();
            setTotalPoolBalance(ethers.formatEther(poolBalance));

            // Fetch user's lent amount
            try {
                const userLent = await readOnlyContract.getUserLentAmount(account);
                setUserLentAmount(ethers.formatEther(userLent));
            } catch (err) {
                console.error("Failed to fetch user lent amount:", err)
                setUserLentAmount("0")
            }

            // Fetch lending APY (you might need to implement this in your contract)
            try {
                const apy = await readOnlyContract.getLendingAPY();
                setLendingAPY(ethers.formatUnits(apy, 18));
            } catch (err) {
                console.error("Failed to fetch lending APY:", err)
                setLendingAPY("5.25") // Default APY
            }

        } catch (err) {
            console.error("Failed to fetch lending data:", err)
        }
    }

    useEffect(() => {
        if (contract && account) {
            fetchLendingData()
        }
    }, [contract, account])

    const handleLend = async () => {
        if (!lendAmount || Number(lendAmount) <= 0) {
            setError("Please enter a valid amount")
            return
        }
        if (!account) {
            setError("Please connect your wallet to lend")
            return
        }
        try {
            setIsLoading(true)
            setError("")
            const amountParsed = ethers.parseEther(lendAmount);
            const tx = await contract.lend({ value: amountParsed });
            await tx.wait();
            setLendAmount("")
            await fetchLendingData()
            setError("Lending successful!")
        } catch (err) {
            console.error("Failed to lend:", err)
            setError(err instanceof Error ? err.message : "Failed to lend")
        } finally {
            setIsLoading(false)
        }
    }

    const handleWithdrawLent = async () => {
        if (!account) {
            setError("Please connect your wallet to withdraw")
            return
        }
        try {
            setIsLoading(true)
            setError("")
            const tx = await contract.withdrawLent();
            await tx.wait();
            await fetchLendingData()
            setError("Withdrawal successful!")
        } catch (err) {
            console.error("Failed to withdraw lent amount:", err)
            setError(err instanceof Error ? err.message : "Failed to withdraw")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Lending Dashboard</h2>
            </div>

            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Lending Overview */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Lending Overview
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Total Pool Balance</p>
                            <p className="text-2xl font-bold">{totalPoolBalance} ETH</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Your Lent Amount</p>
                            <p className="text-2xl font-bold">{userLentAmount} ETH</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-sm text-muted-foreground">Current APY</p>
                            <div className="flex items-center gap-2">
                                <p className="text-2xl font-bold">{lendingAPY}%</p>
                                <TrendingUp className="h-4 w-4 text-green-600" />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Lend Funds */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Lend Funds
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Amount to Lend</label>
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

                    <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                            By lending funds to the pool, you'll earn interest at the current APY rate.
                        </p>
                    </div>

                    <Button
                        onClick={handleLend}
                        className="w-full h-12"
                        disabled={isLoading}
                    >
                        {isLoading ? "Processing..." : "Lend Funds"}
                    </Button>
                </CardContent>
            </Card>

            {/* Withdraw Lent Funds */}
            {Number(userLentAmount) > 0 && (
                <Card className="bg-gradient-to-br from-background to-muted/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Withdraw Lent Funds
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="p-4 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">
                                You have {userLentAmount} ETH lent to the pool. You can withdraw your funds at any time.
                            </p>
                        </div>

                        <Button
                            onClick={handleWithdrawLent}
                            className="w-full h-12"
                            disabled={isLoading}
                            variant="outline"
                        >
                            {isLoading ? "Processing..." : "Withdraw All Lent Funds"}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Lending Information */}
            <Card className="bg-gradient-to-br from-background to-muted/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Percent className="h-5 w-5" />
                        How Lending Works
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium mt-0.5">
                                1
                            </div>
                            <div>
                                <p className="font-medium">Deposit Funds</p>
                                <p className="text-sm text-muted-foreground">
                                    Lend your ETH to the liquidity pool to earn interest.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium mt-0.5">
                                2
                            </div>
                            <div>
                                <p className="font-medium">Earn Interest</p>
                                <p className="text-sm text-muted-foreground">
                                    Your funds are used to provide loans to borrowers, and you earn interest on your deposits.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium mt-0.5">
                                3
                            </div>
                            <div>
                                <p className="font-medium">Withdraw Anytime</p>
                                <p className="text-sm text-muted-foreground">
                                    You can withdraw your lent funds and earned interest at any time.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
} 