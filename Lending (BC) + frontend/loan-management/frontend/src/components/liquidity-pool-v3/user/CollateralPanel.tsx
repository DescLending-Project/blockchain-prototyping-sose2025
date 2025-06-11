import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Alert, AlertDescription } from '../../ui/alert';

interface CollateralPanelProps {
    contract: ethers.Contract;
    account: string;
    tokenAddress: string;
}

interface HealthStatus {
    isHealthy: boolean;
}

export function CollateralPanel({ contract, account, tokenAddress }: CollateralPanelProps) {
    const [healthStatus, setHealthStatus] = useState<HealthStatus>({
        isHealthy: false
    });
    const [error, setError] = useState<string>('');
    const [collateralValue, setCollateralValue] = useState<string>('0');
    const [collateralBalance, setCollateralBalance] = useState<string>('0');
    const [pendingInterest, setPendingInterest] = useState<string>('0');

    const fetchCollateralData = async () => {
        if (!contract || !account || !tokenAddress) {
            console.log('Missing required data:', { contract: !!contract, account: !!account, tokenAddress: !!tokenAddress });
            return;
        }

        try {
            console.log('Fetching collateral data for:', { account, tokenAddress });

            // Get collateral balance using getCollateral
            const balance = await contract.getCollateral(account, tokenAddress);
            console.log('Raw collateral balance:', balance.toString());
            const formattedBalance = ethers.formatEther(balance);
            console.log('Formatted collateral balance:', formattedBalance);
            setCollateralBalance(formattedBalance);

            // Get total collateral value using getTotalCollateralValue
            const totalValue = await contract.getTotalCollateralValue(account);
            console.log('Total collateral value:', totalValue.toString());

            // Convert to USD (using a fixed rate for now)
            const usdRate = 1; // Replace with actual price feed in production
            const valueInUsd = Number(ethers.formatEther(totalValue)) * usdRate;
            setCollateralValue(valueInUsd.toFixed(2));

            // Get health status - only use the boolean
            const [isHealthy] = await contract.checkCollateralization(account);
            setHealthStatus({
                isHealthy
            });

            // Get pending interest
            const lenderInfo = await contract.getLenderInfo(account);
            const pendingInterestInWei = lenderInfo.pendingInterest;
            const pendingInterestInUsd = Number(ethers.formatEther(pendingInterestInWei)) * usdRate;
            setPendingInterest(pendingInterestInUsd.toFixed(2));

            setError('');
        } catch (err) {
            console.error('Failed to fetch collateral data:', err);
            setError('Failed to fetch collateral data. Please try again.');
        }
    };

    // Initial data fetch
    useEffect(() => {
        console.log('CollateralPanel mounted with:', { account, tokenAddress });
        fetchCollateralData();
    }, [contract, account, tokenAddress]);

    // Add a refresh button
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
                        >
                            Refresh
                        </button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-gray-500">Current Balance</p>
                            <p className="text-lg font-semibold">{collateralBalance} GLINT</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Current Value</p>
                            <p className="text-lg font-semibold">${collateralValue}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Pending Interest</p>
                            <p className="text-lg font-semibold">${pendingInterest}</p>
                        </div>
                    </div>

                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="mt-4">
                        <p className="text-sm text-gray-500">Health Status</p>
                        <p className={`text-lg font-semibold ${healthStatus.isHealthy ? 'text-green-500' : 'text-red-500'}`}>
                            {healthStatus.isHealthy ? 'Healthy' : 'Unhealthy'}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
} 