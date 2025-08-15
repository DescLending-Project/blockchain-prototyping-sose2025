import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Alert, AlertDescription } from '../../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { COLLATERAL_TOKENS } from '../../../App';
import { AlertTriangle, TrendingUp, Unlock } from 'lucide-react';

interface CollateralPanelProps {
    contract: ethers.Contract;
    account: string;
}

interface HealthStatus {
    isHealthy: boolean;
}

interface CollateralInfo {
    token: string;
    symbol: string;
    balance: string;
    value: number;
    isStablecoin: boolean;
    ltv?: number;
    liquidationThreshold?: number;
    withdrawableAmount?: string;
}

interface CreditScoreInfo {
    currentScore: number;
    previousScore: number;
    hasImproved: boolean;
    improvementPercentage: number;
}

export function CollateralPanel({ contract, account }: CollateralPanelProps) {
    const [healthStatus, setHealthStatus] = useState<HealthStatus>({
        isHealthy: false
    });
    const [error, setError] = useState<string>('');
    const [collaterals, setCollaterals] = useState<CollateralInfo[]>([]);
    const [totalValue, setTotalValue] = useState<string>('0');
    const [loading, setLoading] = useState<boolean>(false);
    const [hasStablecoinCollateral, setHasStablecoinCollateral] = useState<boolean>(false);
    const [creditScore, setCreditScore] = useState<CreditScoreInfo>({
        currentScore: 0,
        previousScore: 0,
        hasImproved: false,
        improvementPercentage: 0
    });
    const [withdrawAmount, setWithdrawAmount] = useState<string>('');
    const [selectedToken, setSelectedToken] = useState<string>('');
    const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);

    const calculateWithdrawableAmount = (collateral: CollateralInfo, creditScore: number): string => {
        if (!collateral.ltv || creditScore <= 0) return '0';

        // Base withdrawable amount (standard calculation)
        const baseWithdrawable = parseFloat(collateral.balance) * 0.1; // 10% base

        // Credit score bonus: higher score allows more withdrawal
        const creditBonus = Math.min((creditScore - 25) / 75, 0.4); // Up to 40% bonus for score 100
        const totalWithdrawableRatio = Math.min(0.1 + creditBonus, 0.5); // Max 50% withdrawable

        const withdrawableAmount = parseFloat(collateral.balance) * totalWithdrawableRatio;
        return withdrawableAmount.toFixed(6);
    };

    const fetchCreditScore = async () => {
        if (!contract || !account) return;

        try {
            const currentScore = await contract.getCreditScore(account);
            const scoreNum = Number(currentScore);

            // Get previous score from localStorage for comparison
            const storageKey = `creditScore_${account}`;
            const previousScore = parseInt(localStorage.getItem(storageKey) || '0');

            const hasImproved = scoreNum > previousScore;
            const improvementPercentage = previousScore > 0 ?
                ((scoreNum - previousScore) / previousScore) * 100 : 0;

            setCreditScore({
                currentScore: scoreNum,
                previousScore,
                hasImproved,
                improvementPercentage
            });

            // Store current score for next comparison
            localStorage.setItem(storageKey, scoreNum.toString());
        } catch (err) {
            console.error('Failed to fetch credit score:', err);
        }
    };

    const fetchCollateralData = async () => {
        if (!contract || !account) return;
        setLoading(true);
        try {
            const allowedTokens: string[] = await safeContractCall(contract, 'getAllowedCollateralTokens');
            if (!allowedTokens) return;
            let total = 0;
            let hasStablecoin = false;

            const validTokens = await Promise.all(
                allowedTokens.map(async (token) => {
                    try {
                        const isAllowed = await contract.isAllowedCollateral(token);
                        const meta = COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === token.toLowerCase());
                        return (isAllowed && meta) ? token : null;
                    } catch (err) {
                        console.error('Error checking if token is allowed:', token, err);
                        return null;
                    }
                })
            );

            const filteredTokens = validTokens.filter(token => token !== null) as string[];

            const rows = await Promise.all(
                filteredTokens.map(async (token) => {
                    try {
                        const balance = await safeContractCall(contract, 'getCollateral', account, token);
                        const value = await safeContractCall(contract, 'getTokenValue', token);

                        if (!balance || !value) return null;

                        const formattedBalance = ethers.formatEther(balance);
                        const balanceNum = Number(formattedBalance);
                        const valuePerToken = Number(ethers.formatEther(value));
                        const valueInUsd = balanceNum * valuePerToken;
                        total += valueInUsd;

                        const meta = COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === token.toLowerCase());
                        const isStablecoin = meta?.isStablecoin || false;
                        if (isStablecoin && Number(formattedBalance) > 0) {
                            hasStablecoin = true;
                        }

                        let ltv, liquidationThreshold;
                        if (isStablecoin) {
                            ltv = await contract.stablecoinLTV(token);
                            liquidationThreshold = await contract.getLiquidationThreshold(token);
                        } else {
                            ltv = await contract.DEFAULT_VOLATILE_LTV;
                            liquidationThreshold = await contract.getLiquidationThreshold(token);
                        }

                        const withdrawableAmount = calculateWithdrawableAmount({
                            token,
                            symbol: meta?.symbol || token.substring(0, 6),
                            balance: formattedBalance,
                            value: valueInUsd,
                            isStablecoin,
                            ltv: ltv ? Number(ltv) : undefined,
                            liquidationThreshold: liquidationThreshold ? Number(liquidationThreshold) : undefined
                        }, creditScore.currentScore);

                        return {
                            token,
                            symbol: meta?.symbol || token.substring(0, 6),
                            balance: formattedBalance,
                            value: valueInUsd,
                            isStablecoin,
                            ltv: ltv ? Number(ltv) : undefined,
                            liquidationThreshold: liquidationThreshold ? Number(liquidationThreshold) : undefined,
                            withdrawableAmount
                        };
                    } catch (err) {
                        console.error('Error fetching data for token:', token, err);
                        return null;
                    }
                })
            );

            const validRows = rows.filter(row => row !== null) as CollateralInfo[];
            setCollaterals(validRows.filter(row => Number(row.balance) > 0));
            setTotalValue(total.toFixed(2));
            setHasStablecoinCollateral(hasStablecoin);

            const [isHealthy] = await contract.checkCollateralization(account);
            setHealthStatus({ isHealthy });
        } catch (err) {
            console.error('Failed to fetch collateral data:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch collateral data');
        } finally {
            setLoading(false);
        }
    };

    const handlePartialWithdraw = async () => {
        if (!selectedToken || !withdrawAmount || !contract) return;

        setIsWithdrawing(true);
        setError('');

        try {
            const amountParsed = ethers.parseUnits(withdrawAmount, 18);
            const tx = await contract.withdrawCollateral(selectedToken, amountParsed);
            await tx.wait();

            setError('Partial withdrawal successful!');
            setWithdrawAmount('');
            setSelectedToken('');
            await fetchCollateralData();
        } catch (err) {
            console.error('Failed to withdraw collateral:', err);
            setError(`Failed to withdraw: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsWithdrawing(false);
        }
    };

    const safeContractCall = async (contract: any, method: string, ...args: any[]) => {
        try {
            return await contract[method](...args);
        } catch (err) {
            console.error(`Contract call error (${method}):`, err);
            if (method === 'getTokenValue') {
                console.warn('Price feed error, using fallback value of 1 USD');
                return ethers.parseUnits('1', 18);
            }
            return null;
        }
    };

    useEffect(() => {
        const controller = new AbortController();

        const fetchData = async () => {
            if (controller.signal.aborted) return;
            await fetchCreditScore();
            await fetchCollateralData();
        };

        fetchData();
        const interval = setInterval(fetchData, 30000);

        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, [contract, account]);

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Collateral Management
                    {creditScore.hasImproved && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            Credit Improved +{creditScore.improvementPercentage.toFixed(1)}%
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Credit Score Info */}
                <div className="p-4 rounded-lg bg-background/50 border">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm text-muted-foreground">Credit Score</p>
                            <p className="text-2xl font-bold">{creditScore.currentScore}</p>
                        </div>
                        {creditScore.hasImproved && (
                            <div className="text-right">
                                <p className="text-sm text-green-600">Improved from {creditScore.previousScore}</p>
                                <p className="text-xs text-muted-foreground">More collateral withdrawable</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Collateral Table */}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Token</TableHead>
                                <TableHead>Balance</TableHead>
                                <TableHead>Value (USD)</TableHead>
                                <TableHead>Withdrawable</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {collaterals.map((collateral) => (
                                <TableRow key={collateral.token}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            {collateral.symbol}
                                            {collateral.isStablecoin && (
                                                <Badge variant="outline" className="text-xs">Stable</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{Number(collateral.balance).toFixed(6)}</TableCell>
                                    <TableCell>${collateral.value.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {collateral.withdrawableAmount}
                                            {Number(collateral.withdrawableAmount || 0) > 0 && (
                                                <Unlock className="h-3 w-3 text-green-500" />
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {Number(collateral.withdrawableAmount || 0) > 0 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedToken(collateral.token)}
                                                disabled={isWithdrawing}
                                            >
                                                Withdraw
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Partial Withdrawal Form */}
                {selectedToken && (
                    <Card className="border-green-200 bg-green-50">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Unlock className="h-4 w-4" />
                                Partial Withdrawal Available
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Your improved credit score allows partial collateral withdrawal
                                </p>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        placeholder="Amount to withdraw"
                                        value={withdrawAmount}
                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                        max={collaterals.find(c => c.token === selectedToken)?.withdrawableAmount}
                                        step="0.000001"
                                    />
                                    <Button
                                        onClick={handlePartialWithdraw}
                                        disabled={isWithdrawing || !withdrawAmount}
                                        className="whitespace-nowrap"
                                    >
                                        {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setSelectedToken('');
                                            setWithdrawAmount('');
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Max withdrawable: {collaterals.find(c => c.token === selectedToken)?.withdrawableAmount} tokens
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Summary */}
                <div className="flex justify-between items-center p-4 rounded-lg bg-background/50 border">
                    <div>
                        <p className="text-sm text-muted-foreground">Total Collateral Value</p>
                        <p className="text-xl font-bold">${totalValue}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Health Status</p>
                        <Badge variant={healthStatus.isHealthy ? "default" : "destructive"}>
                            {healthStatus.isHealthy ? "Healthy" : "At Risk"}
                        </Badge>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
} 
