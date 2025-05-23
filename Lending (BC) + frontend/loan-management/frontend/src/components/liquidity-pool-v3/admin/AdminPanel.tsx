import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { ethers, Contract, BaseContract, ContractTransactionResponse } from "ethers"
import { Alert, AlertDescription } from "../../../components/ui/alert"
import { AlertCircle, Settings, Users, DollarSign, Percent, Shield, Key, UserPlus, UserCog, Clock, Timer, AlertTriangle, Coins, ArrowUpDown } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface LiquidityPoolContract extends BaseContract {
    withdraw: (amount: bigint) => Promise<ContractTransactionResponse>;
    paused: () => Promise<boolean>;
    togglePause: () => Promise<ContractTransactionResponse>;
    setPaused: (paused: boolean) => Promise<ContractTransactionResponse>;
    setCreditScore: (user: string, score: number) => Promise<ContractTransactionResponse>;
    setLiquidationThreshold: (token: string, threshold: bigint) => Promise<ContractTransactionResponse>;
    setPriceFeed: (token: string, feed: string) => Promise<ContractTransactionResponse>;
    setLiquidator: (liquidator: string) => Promise<ContractTransactionResponse>;
    setAdmin: (admin: string) => Promise<ContractTransactionResponse>;
    setCollateralToken: (token: string, allowed: boolean) => Promise<ContractTransactionResponse>;
    setInterestRate: (rate: bigint) => Promise<ContractTransactionResponse>;
    setMaxBorrowAmount: (amount: bigint) => Promise<ContractTransactionResponse>;
    setMaxCollateralAmount: (amount: bigint) => Promise<ContractTransactionResponse>;
    setMaxLiquidationBonus: (bonus: bigint) => Promise<ContractTransactionResponse>;
    setMaxLiquidationPenalty: (penalty: bigint) => Promise<ContractTransactionResponse>;
    setMaxLiquidationThreshold: (threshold: bigint) => Promise<ContractTransactionResponse>;
    setMaxLiquidationTime: (time: number) => Promise<ContractTransactionResponse>;
    setMaxLiquidationAmount: (amount: bigint) => Promise<ContractTransactionResponse>;
    setMaxLiquidationRatio: (ratio: bigint) => Promise<ContractTransactionResponse>;
    setMaxLiquidationDelay: (delay: number) => Promise<ContractTransactionResponse>;
    setMaxLiquidationGracePeriod: (period: number) => Promise<ContractTransactionResponse>;
    // Read-only functions
    getCreditScore: (user: string) => Promise<number>;
    getLiquidationThreshold: (token: string) => Promise<bigint>;
    getPriceFeed: (token: string) => Promise<string>;
    getLiquidator: () => Promise<string>;
    getAdmin: () => Promise<string>;
    isCollateralToken: (token: string) => Promise<boolean>;
    getInterestRate: () => Promise<bigint>;
    getMaxBorrowAmount: () => Promise<bigint>;
    getMaxCollateralAmount: () => Promise<bigint>;
    getMaxLiquidationBonus: () => Promise<bigint>;
    getMaxLiquidationPenalty: () => Promise<bigint>;
    getMaxLiquidationThreshold: () => Promise<bigint>;
    getMaxLiquidationTime: () => Promise<number>;
    getMaxLiquidationAmount: () => Promise<bigint>;
    getMaxLiquidationRatio: () => Promise<bigint>;
    getMaxLiquidationDelay: () => Promise<number>;
    getMaxLiquidationGracePeriod: () => Promise<number>;
}

interface AdminPanelProps {
    contract: Contract;
    account: string | null;
}

export function AdminPanel({ contract, account }: AdminPanelProps) {
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [selectedUser, setSelectedUser] = useState("")
    const [creditScore, setCreditScore] = useState("")
    const [userCreditScore, setUserCreditScore] = useState<number | null>(null)
    const [liquidationThreshold, setLiquidationThreshold] = useState("")
    const [tokenLiquidationThreshold, setTokenLiquidationThreshold] = useState<bigint | null>(null)
    const [selectedToken, setSelectedToken] = useState("")
    const [priceFeedAddress, setPriceFeedAddress] = useState("")
    const [tokenPriceFeed, setTokenPriceFeed] = useState<string | null>(null)
    const [newLiquidator, setNewLiquidator] = useState("")
    const [currentLiquidator, setCurrentLiquidator] = useState<string | null>(null)
    const [newAdmin, setNewAdmin] = useState("")
    const [currentAdmin, setCurrentAdmin] = useState<string | null>(null)
    const [newCollateralToken, setNewCollateralToken] = useState("")
    const [isTokenCollateral, setIsTokenCollateral] = useState<boolean | null>(null)
    const [interestRate, setInterestRate] = useState("")
    const [currentInterestRate, setCurrentInterestRate] = useState<bigint | null>(null)
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

    useEffect(() => {
        const checkPauseStatus = async () => {
            try {
                const paused = await contract.paused(); // Direct call
                setIsPaused(paused);
            } catch (err) {
                console.error("Failed to check pause status:", err);
            }
        };
    
        checkPauseStatus();
    }, [contract]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [liquidator, admin, interestRate] = await Promise.all([
                    contract.liquidator(),
                    contract.getAdmin(),
                    contract.getInterestRate()
                ]);
                setCurrentLiquidator(liquidator);
                setCurrentAdmin(admin);
                setCurrentInterestRate(interestRate);
            } catch (err) {
                console.error("Failed to fetch initial data:", err);
            }
        };
        fetchInitialData();
    }, [contract]);

    const handleSetCreditScore = async () => {
        if (!selectedUser) return setError("Please select a user");
        if (!creditScore || Number(creditScore) < 0 || Number(creditScore) > 100)
            return setError("Please enter a valid credit score (0-100)");
    
        try {
            setIsLoading(true);
            const tx = await contract.setCreditScore(selectedUser, Number(creditScore));
            await tx.wait();
            setCreditScore("");
            setSelectedUser("");
            setError("Credit score updated!");
        } catch (err) {
            console.error("Failed to set credit score:", err);
            setError("Failed to set credit score");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetLiquidationThreshold = async () => {
        if (!selectedToken) return setError("Please select a token");
        if (!liquidationThreshold || Number(liquidationThreshold) <= 0)
            return setError("Please enter a valid liquidation threshold");
    
        try {
            setIsLoading(true);
            const parsedThreshold = ethers.parseUnits(liquidationThreshold, 18);
            const tx = await contract.setLiquidationThreshold(selectedToken, parsedThreshold);
            await tx.wait();
            setLiquidationThreshold("");
            setSelectedToken("");
            setError("");
        } catch (err) {
            console.error("Failed to set liquidation threshold:", err);
            setError("Failed to set liquidation threshold");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetPriceFeed = async () => {
        if (!selectedToken) return setError("Please select a token");
        if (!priceFeedAddress) return setError("Please enter a price feed address");
    
        try {
            setIsLoading(true);
            const tx = await contract.setPriceFeed(selectedToken, priceFeedAddress);
            await tx.wait();
            setPriceFeedAddress("");
            setSelectedToken("");
        } catch (err) {
            setError("Failed to set price feed");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetLiquidator = async () => {
        if (!newLiquidator) return setError("Please enter a liquidator address");
        try {
            setIsLoading(true);
            const tx = await contract.setLiquidator(newLiquidator);
            await tx.wait();
            setNewLiquidator("");
        } catch (err) {
            setError("Failed to set liquidator");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetAdmin = async () => {
        if (!newAdmin) return setError("Please enter an admin address");
        try {
            setIsLoading(true);
            const tx = await contract.setAdmin(newAdmin);
            await tx.wait();
            setNewAdmin("");
        } catch (err) {
            setError("Failed to set admin");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetCollateralToken = async () => {
        if (!newCollateralToken) return setError("Please enter a token address");
        try {
            setIsLoading(true);
            const tx = await contract.setCollateralToken(newCollateralToken, true);
            await tx.wait();
            setNewCollateralToken("");
        } catch (err) {
            setError("Failed to set collateral token");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetInterestRate = async () => {
        if (!interestRate || Number(interestRate) < 0)
            return setError("Please enter a valid interest rate");
    
        try {
            setIsLoading(true);
            const tx = await contract.setInterestRate(ethers.parseUnits(interestRate, 18));
            await tx.wait();
            setInterestRate("");
        } catch (err) {
            setError("Failed to set interest rate");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetMaxBorrowAmount = async () => {
        if (!maxBorrowAmount || Number(maxBorrowAmount) <= 0) {
            setError("Please enter a valid max borrow amount");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxBorrowAmount(ethers.parseUnits(maxBorrowAmount, 18));
            await tx.wait();
            setMaxBorrowAmount("");
        } catch (err) {
            setError("Failed to set max borrow amount");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxCollateralAmount = async () => {
        if (!maxCollateralAmount || Number(maxCollateralAmount) <= 0) {
            setError("Please enter a valid max collateral amount");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxCollateralAmount(ethers.parseUnits(maxCollateralAmount, 18));
            await tx.wait();
            setMaxCollateralAmount("");
        } catch (err) {
            setError("Failed to set max collateral amount");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxLiquidationBonus = async () => {
        if (!maxLiquidationBonus || Number(maxLiquidationBonus) < 0) {
            setError("Please enter a valid max liquidation bonus");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationBonus(ethers.parseUnits(maxLiquidationBonus, 18));
            await tx.wait();
            setMaxLiquidationBonus("");
        } catch (err) {
            setError("Failed to set max liquidation bonus");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxLiquidationPenalty = async () => {
        if (!maxLiquidationPenalty || Number(maxLiquidationPenalty) < 0) {
            setError("Please enter a valid max liquidation penalty");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationPenalty(ethers.parseUnits(maxLiquidationPenalty, 18));
            await tx.wait();
            setMaxLiquidationPenalty("");
        } catch (err) {
            setError("Failed to set max liquidation penalty");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxLiquidationThreshold = async () => {
        if (!maxLiquidationThreshold || Number(maxLiquidationThreshold) <= 0) {
            setError("Please enter a valid max liquidation threshold");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationThreshold(ethers.parseUnits(maxLiquidationThreshold, 18));
            await tx.wait();
            setMaxLiquidationThreshold("");
        } catch (err) {
            setError("Failed to set max liquidation threshold");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxLiquidationTime = async () => {
        if (!maxLiquidationTime || Number(maxLiquidationTime) <= 0) {
            setError("Please enter a valid max liquidation time");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationTime(Number(maxLiquidationTime));
            await tx.wait();
            setMaxLiquidationTime("");
        } catch (err) {
            setError("Failed to set max liquidation time");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetMaxLiquidationAmount = async () => {
        if (!maxLiquidationAmount || Number(maxLiquidationAmount) <= 0) {
            setError("Please enter a valid max liquidation amount");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationAmount(ethers.parseUnits(maxLiquidationAmount, 18));
            await tx.wait();
            setMaxLiquidationAmount("");
        } catch (err) {
            setError("Failed to set max liquidation amount");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxLiquidationRatio = async () => {
        if (!maxLiquidationRatio || Number(maxLiquidationRatio) <= 0) {
            setError("Please enter a valid max liquidation ratio");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationRatio(ethers.parseUnits(maxLiquidationRatio, 18));
            await tx.wait();
            setMaxLiquidationRatio("");
        } catch (err) {
            setError("Failed to set max liquidation ratio");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxLiquidationDelay = async () => {
        if (!maxLiquidationDelay || Number(maxLiquidationDelay) <= 0) {
            setError("Please enter a valid max liquidation delay");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationDelay(Number(maxLiquidationDelay));
            await tx.wait();
            setMaxLiquidationDelay("");
        } catch (err) {
            setError("Failed to set max liquidation delay");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSetMaxLiquidationGracePeriod = async () => {
        if (!maxLiquidationGracePeriod || Number(maxLiquidationGracePeriod) <= 0) {
            setError("Please enter a valid max liquidation grace period");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.setMaxLiquidationGracePeriod(Number(maxLiquidationGracePeriod));
            await tx.wait();
            setMaxLiquidationGracePeriod("");
        } catch (err) {
            setError("Failed to set max liquidation grace period");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleExtractFunds = async () => {
        if (!extractAmount || Number(extractAmount) <= 0) {
            setError("Please enter a valid amount to extract");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.withdraw(ethers.parseEther(extractAmount));
            await tx.wait();
            setExtractAmount("");
            setError("Funds extracted successfully!");
        } catch (err) {
            console.error("Failed to extract funds:", err);
            setError(err instanceof Error ? err.message : "Failed to extract funds");
        } finally {
            setIsLoading(false);
        }
    };

    const handleTogglePause = async () => {
        try {
            setIsLoading(true);
            const tx = await contract.togglePause();
            await tx.wait();
            setIsPaused(!isPaused);
            setError("");
        } catch (err) {
            console.error("Failed to toggle pause:", err);
            setError("Failed to toggle pause status");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGetCreditScore = async () => {
        if (!selectedUser) {
            setError("Please enter a user address");
            return;
        }
        try {
            setIsLoading(true);
            const score = await contract.getCreditScore(selectedUser);
            setUserCreditScore(Number(score));
            setError("");
        } catch (err) {
            console.error("Failed to get credit score:", err);
            setError("Failed to get credit score");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGetLiquidationThreshold = async () => {
        if (!selectedToken) {
            setError("Please enter a token address");
            return;
        }
        try {
            setIsLoading(true);
            const threshold = await contract.getLiquidationThreshold(selectedToken);
            setTokenLiquidationThreshold(threshold);
            setError("");
        } catch (err) {
            console.error("Failed to get liquidation threshold:", err);
            setError("Failed to get liquidation threshold");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGetPriceFeed = async () => {
        if (!selectedToken) {
            setError("Please enter a token address");
            return;
        }
        try {
            setIsLoading(true);
            const feed = await contract.getPriceFeed(selectedToken);
            setTokenPriceFeed(feed);
            setError("");
        } catch (err) {
            console.error("Failed to get price feed:", err);
            setError("Failed to get price feed");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCheckCollateralToken = async () => {
        if (!newCollateralToken) {
            setError("Please enter a token address");
            return;
        }
        try {
            setIsLoading(true);
            const isCollateral = await contract.isAllowedCollateral(newCollateralToken);
            setIsTokenCollateral(isCollateral);
            setError("");
        } catch (err) {
            console.error("Failed to check collateral token:", err);
            setError("Failed to check collateral token");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 w-full">
            {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card className="bg-background/50 border-none shadow-none">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Emergency Controls
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={handleTogglePause}
                        variant={isPaused ? "default" : "destructive"}
                        className="w-full h-12"
                        disabled={isLoading}
                    >
                        {isLoading ? "Processing..." : isPaused ? "Resume Contract" : "Pause Contract"}
                    </Button>
                </CardContent>
            </Card>

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
                                User Credit Score
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

                            <div className="flex gap-4">
                                <Button
                                    onClick={handleGetCreditScore}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Loading..." : "Get Credit Score"}
                                </Button>
                                <Button
                                    onClick={handleSetCreditScore}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Processing..." : "Set Credit Score"}
                                </Button>
                            </div>

                            {userCreditScore !== null && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">Current Credit Score: {userCreditScore}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium">New Credit Score (0-100)</label>
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
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="threshold">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Liquidation Threshold
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

                            <div className="flex gap-4">
                                <Button
                                    onClick={handleGetLiquidationThreshold}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Loading..." : "Get Threshold"}
                                </Button>
                                <Button
                                    onClick={handleSetLiquidationThreshold}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Processing..." : "Set Threshold"}
                                </Button>
                            </div>

                            {tokenLiquidationThreshold !== null && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">Current Threshold: {ethers.formatUnits(tokenLiquidationThreshold, 18)}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium">New Threshold Value</label>
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
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="price">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5" />
                                Price Feed
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

                            <div className="flex gap-4">
                                <Button
                                    onClick={handleGetPriceFeed}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Loading..." : "Get Price Feed"}
                                </Button>
                                <Button
                                    onClick={handleSetPriceFeed}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Processing..." : "Set Price Feed"}
                                </Button>
                            </div>

                            {tokenPriceFeed !== null && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">Current Price Feed: {tokenPriceFeed}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium">New Price Feed Address</label>
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
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="collateral">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Key className="h-5 w-5" />
                                Collateral Token
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

                            <div className="flex gap-4">
                                <Button
                                    onClick={handleCheckCollateralToken}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Loading..." : "Check Token"}
                                </Button>
                                <Button
                                    onClick={handleSetCollateralToken}
                                    className="flex-1 h-12"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Processing..." : "Set as Collateral"}
                                </Button>
                            </div>

                            {isTokenCollateral !== null && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">
                                        Token Status: {isTokenCollateral ? "Is Collateral" : "Not Collateral"}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="liquidator">
                    <Card className="bg-background/50 border-none shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5" />
                                Liquidator
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
                                Admin
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {currentAdmin && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">Current Admin: {currentAdmin}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium">New Admin Address</label>
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
                                Interest Rate
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {currentInterestRate !== null && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">Current Interest Rate: {ethers.formatUnits(currentInterestRate, 18)}%</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium">New Interest Rate (%)</label>
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