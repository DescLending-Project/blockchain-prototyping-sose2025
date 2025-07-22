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

    const safeContractCall = async (contract: any, method: string, ...args: any[]) => {
        try {
            return await contract[method](...args);
        } catch (err) {
            console.error(`Contract call error (${method}):`, err);
            // For getTokenValue, return a default value of 1e18 (1 USD) if price feed fails
            if (method === 'getTokenValue') {
                console.warn('Price feed error, using fallback value of 1 USD');
                return ethers.parseUnits('1', 18);
            }
            return null;
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
                        // Only return tokens that are allowed and have metadata in COLLATERAL_TOKENS
                        const meta = COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === token.toLowerCase());
                        return (isAllowed && meta) ? token : null;
                    } catch (err) {
                        console.error('Error checking if token is allowed:', token, err);
                        return null;
                    }
                })
            );

            // Remove duplicates by address (case-insensitive)
            const seenAddresses = new Set();
            const filteredTokens = validTokens
                .filter(token => token !== null)
                .filter(token => {
                    const lowerCaseAddr = token.toLowerCase();
                    if (seenAddresses.has(lowerCaseAddr)) {
                        return false;
                    }
                    seenAddresses.add(lowerCaseAddr);
                    return true;
                }) as string[];

            const rows = await Promise.all(
                filteredTokens.map(async (token) => {
                    try {
                        // Use safe calls for all contract interactions
                        const balance = await safeContractCall(contract, 'getCollateral', account, token);
                        const value = await safeContractCall(contract, 'getTokenValue', token);

                        if (!balance || !value) return null;

                        const formattedBalance = ethers.formatEther(balance);
                        const balanceNum = Number(formattedBalance);
                        const valuePerToken = Number(ethers.formatEther(value));
                        const valueInUsd = balanceNum * valuePerToken;
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
        const controller = new AbortController();

        const fetchData = async () => {
            if (controller.signal.aborted) return;
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

                <div className="space-y-2">
                    <p className="font-medium">Your Collateral Position:</p>
                    <ul className="list-disc list-inside space-y-1">
                        <li>Current Collateral: 0.0 Token</li>
                        <li>Collateral Value in ETH: ETH</li>
                        <li>Required Collateral Ratio: 130% of borrow amount</li>
                    </ul>
                </div>
                <div className="rounded-xl border text-card-foreground shadow bg-gradient-to-br from-background to-muted/50 mt-6">
                    <div className="flex flex-col space-y-1.5 p-6">
                        <h3 className="font-semibold leading-none tracking-tight flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shield h-5 w-5" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path></svg>
                            Collateral Management
                        </h3>
                    </div>
                    <div className="p-6 pt-0 space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Select Token</label>
                            <button type="button" role="combobox" className="flex h-9 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full">
                                <span style={{ pointerEvents: 'none' }}>Select a token</span>
                            </button>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Amount</label>
                            <input className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full" placeholder="Enter amount to deposit/withdraw" min="0" step="0.01" type="number" />
                        </div>
                        <div className="flex gap-4">
                            <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 px-4 py-2 flex-1 h-12">Deposit</button>
                            <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground px-4 py-2 flex-1 h-12">Withdraw</button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
} 