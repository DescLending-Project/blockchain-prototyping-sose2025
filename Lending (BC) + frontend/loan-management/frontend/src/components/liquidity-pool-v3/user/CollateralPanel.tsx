import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Alert, AlertDescription } from '../../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { COLLATERAL_TOKENS } from '../../../App';
import { AlertTriangle } from 'lucide-react';

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

    const fetchCollateralData = async () => {
        if (!contract || !account) return;
        setLoading(true);
        try {
            const allowedTokens: string[] = await contract.getAllowedCollateralTokens();
            let total = 0;
            let hasStablecoin = false;

            // Pre-filter to only process tokens that are actually allowed
            const validTokens = await Promise.all(
                allowedTokens.map(async (token) => {
                    try {
                        const isAllowed = await contract.isAllowedCollateral(token);
                        return isAllowed ? token : null;
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
                        const balance = await contract.getCollateral(account, token);
                        const value = await contract.getTokenValue(token);
                        const formattedBalance = ethers.formatEther(balance);
                        const valueInUsd = Number(ethers.formatEther(balance)) * Number(ethers.formatEther(value));
                        total += valueInUsd;

                        // Get token metadata
                        const meta = COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === token.toLowerCase());
                        const isStablecoin = meta?.isStablecoin || false;
                        if (isStablecoin && Number(formattedBalance) > 0) {
                            hasStablecoin = true;
                        }

                        // Get LTV and liquidation threshold
                        let ltv, liquidationThreshold;
                        if (isStablecoin) {
                            ltv = await contract.stablecoinLTV(token);
                            liquidationThreshold = await contract.getLiquidationThreshold(token);
                        } else {
                            ltv = await contract.DEFAULT_VOLATILE_LTV;
                            liquidationThreshold = await contract.getLiquidationThreshold(token);
                        }

                        return {
                            token,
                            symbol: meta?.symbol || token.substring(0, 6),
                            balance: formattedBalance,
                            value: valueInUsd,
                            isStablecoin,
                            ltv: ltv ? Number(ltv) : undefined,
                            liquidationThreshold: liquidationThreshold ? Number(liquidationThreshold) : undefined
                        };
                    } catch (err) {
                        console.error('Error fetching data for token:', token, err);
                        return null; // Skip this token
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

    useEffect(() => {
        fetchCollateralData();
        const interval = setInterval(fetchCollateralData, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, [contract, account]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Collateral Management</CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {hasStablecoinCollateral && (
                    <Alert className="mb-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            Warning: Using stablecoins as collateral may expose you to depegging risks.
                            While stablecoins have higher LTV ratios, they may be subject to market volatility
                            during extreme conditions.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="mb-4">
                    <h3 className="text-lg font-medium mb-2">Total Collateral Value: ${totalValue}</h3>
                    <div className={`text-sm ${healthStatus.isHealthy ? 'text-green-600' : 'text-red-600'}`}>
                        Position Status: {healthStatus.isHealthy ? 'Healthy' : 'At Risk'}
                    </div>
                </div>

                {collaterals.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Token</TableHead>
                                <TableHead>Balance</TableHead>
                                <TableHead>Value (USD)</TableHead>
                                <TableHead>LTV</TableHead>
                                <TableHead>Liquidation Threshold</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {collaterals.map((collateral) => (
                                <TableRow key={collateral.token}>
                                    <TableCell>
                                        {collateral.symbol}
                                        {collateral.isStablecoin && (
                                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                Stablecoin
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>{collateral.balance}</TableCell>
                                    <TableCell>${collateral.value.toFixed(2)}</TableCell>
                                    <TableCell>{collateral.ltv}%</TableCell>
                                    <TableCell>{collateral.liquidationThreshold}%</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center text-gray-500 py-4">
                        No collateral deposited
                    </div>
                )}
            </CardContent>
        </Card>
    );
} 