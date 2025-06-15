import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Alert, AlertDescription } from '../../ui/alert';

// Import COLLATERAL_TOKENS for symbol lookup
import { COLLATERAL_TOKENS } from '../../../App';

interface CollateralPanelProps {
    contract: ethers.Contract;
    account: string;
}

interface HealthStatus {
    isHealthy: boolean;
}

export function CollateralPanel({ contract, account }: CollateralPanelProps) {
    const [healthStatus, setHealthStatus] = useState<HealthStatus>({
        isHealthy: false
    });
    const [error, setError] = useState<string>('');
    const [collaterals, setCollaterals] = useState<any[]>([]);
    const [totalValue, setTotalValue] = useState<string>('0');
    const [pendingInterest, setPendingInterest] = useState<string>('0');
    const [loading, setLoading] = useState<boolean>(false);

    const fetchCollateralData = async () => {
        if (!contract || !account) return;
        setLoading(true);
        try {
            // Get allowed collateral tokens
            const allowedTokens: string[] = await contract.getAllowedCollateralTokens();
            let total = 0;
            const rows = await Promise.all(
                allowedTokens.map(async (token) => {
                    const balance = await contract.getCollateral(account, token);
                    const value = await contract.getTokenValue(token);
                    const formattedBalance = ethers.formatEther(balance);
                    const valueInUsd = Number(ethers.formatEther(balance)) * Number(ethers.formatEther(value));
                    total += valueInUsd;
                    // Lookup symbol
                    const meta = COLLATERAL_TOKENS.find(t => t.address.toLowerCase() === token.toLowerCase());
                    return {
                        token,
                        symbol: meta ? meta.symbol : token.substring(0, 6),
                        balance: formattedBalance,
                        value: valueInUsd
                    };
                })
            );
            setCollaterals(rows.filter(row => Number(row.balance) > 0));
            setTotalValue(total.toFixed(2));

            // Get health status
            const [isHealthy] = await contract.checkCollateralization(account);
            setHealthStatus({ isHealthy });

            // Get pending interest
            const lenderInfo = await contract.getLenderInfo(account);
            const pendingInterestInWei = lenderInfo.pendingInterest;
            setPendingInterest(Number(ethers.formatEther(pendingInterestInWei)).toFixed(2));

            setError('');
        } catch (err) {
            setError('Failed to fetch collateral data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCollateralData();
        // eslint-disable-next-line
    }, [contract, account]);

    const handleRefresh = async () => {
        await fetchCollateralData();
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Collateral Management</span>
                        <button
                            onClick={handleRefresh}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : 'Refresh'}
                        </button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {collaterals.length === 0 ? (
                        <div className="py-4 text-center text-gray-500">No collateral deposited yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-2">Token</th>
                                        <th className="text-left py-2 px-2">Balance</th>
                                        <th className="text-left py-2 px-2">Current Value ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {collaterals.map(row => (
                                        <tr key={row.token} className="border-b hover:bg-gray-50">
                                            <td className="py-2 px-2 font-semibold">{row.symbol}</td>
                                            <td className="py-2 px-2">{row.balance} {row.symbol}</td>
                                            <td className="py-2 px-2">${row.value.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="mt-4 text-right font-bold text-lg">
                                Total Collateral Value: ${totalValue}
                            </div>
                        </div>
                    )}

                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-gray-500">Pending Interest</p>
                            <p className="text-lg font-semibold">${pendingInterest}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Health Status</p>
                            <p className={`text-lg font-semibold ${healthStatus.isHealthy ? 'text-green-500' : 'text-red-500'}`}>
                                {healthStatus.isHealthy ? 'Healthy' : 'Unhealthy'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
} 