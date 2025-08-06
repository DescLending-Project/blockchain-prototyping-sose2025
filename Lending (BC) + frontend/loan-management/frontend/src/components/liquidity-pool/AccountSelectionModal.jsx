// AccountSelectionModal.jsx
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Checkbox } from '../ui/checkbox';
import { Shield, CheckCircle, AlertCircle } from 'lucide-react';

export function AccountSelectionModal({ contracts, account, onComplete }) {
    const [availableAccounts, setAvailableAccounts] = useState([]);
    const [selectedAccounts, setSelectedAccounts] = useState([]);
    const [hasAlreadySelected, setHasAlreadySelected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (contracts?.nullifierRegistry && account) {
            checkExistingSelection();
            loadAvailableAccounts();
        }
    }, [contracts?.nullifierRegistry, account]);

    const checkExistingSelection = async () => {
        if (!contracts?.nullifierRegistry || !account) {
            console.log('Missing requirements:', { 
                hasNullifierRegistry: !!contracts?.nullifierRegistry, 
                account 
            });
            return;
        }
        
        try {
            console.log('Checking account selection with:', {
                contract: contracts.nullifierRegistry,
                contractAddress: contracts.nullifierRegistry.target || contracts.nullifierRegistry.address,
                account: account
            });
            
            const hasSelected = await contracts.nullifierRegistry.hasSelectedAccounts(account);
            console.log('Has selected accounts result:', hasSelected);
            setHasAlreadySelected(hasSelected);
            
            if (hasSelected) {
                const accounts = await contracts.nullifierRegistry.getUserAccounts(account);
                console.log('Retrieved accounts:', accounts);
                setSelectedAccounts(accounts);
            }
        } catch (err) {
            console.error('Failed to check existing selection:', err);
            console.log('Contract methods available:', Object.keys(contracts.nullifierRegistry));
            setError('Failed to check account selection status. Please check your connection.');
        }
    };

    const loadAvailableAccounts = async () => {
        if (!window.ethereum) return;
        
        try {
            // Get all accounts from MetaMask
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            setAvailableAccounts(accounts);
        } catch (err) {
            setError('Failed to load MetaMask accounts');
        }
    };

    const handleAccountToggle = (account) => {
        if (hasAlreadySelected) return;
        
        setSelectedAccounts(prev => {
            if (prev.includes(account)) {
                return prev.filter(a => a !== account);
            } else {
                return [...prev, account];
            }
        });
    };

    const handleSubmitSelection = async () => {
        if (selectedAccounts.length === 0) {
            setError('Please select at least one account');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            if (!contracts?.nullifierRegistry) {
                setError('Nullifier registry contract is not available. Please check your configuration.');
                return;
            }

            console.log('Submitting account selection:', selectedAccounts);
            const tx = await contracts.nullifierRegistry.selectAccounts(selectedAccounts);
            console.log('Transaction submitted:', tx.hash);
            await tx.wait();
            console.log('Transaction confirmed');
            
            // Generate initial nullifier for display
            const nullifier = await generateNullifier(selectedAccounts);
            
            onComplete({
                accounts: selectedAccounts,
                nullifier: nullifier
            });
        } catch (err) {
            console.error('Transaction failed:', err);
            setError(`Failed to submit account selection: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const generateNullifier = async (accounts) => {
        // This will be called fresh for each borrow
        const timestamp = Math.floor(Date.now() / 1000);
        const message = ethers.solidityPackedKeccak256(
            ["address[]", "uint256"],
            [accounts, timestamp]
        );
        return message;
    };

    if (hasAlreadySelected) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        Accounts Already Selected
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-600 mb-4">
                        You have already selected your accounts for credit scoring.
                    </p>
                    <div className="space-y-2">
                        {selectedAccounts.map((acc, idx) => (
                            <div key={idx} className="p-2 bg-gray-50 rounded">
                                <span className="font-mono text-sm">
                                    {acc.slice(0, 6)}...{acc.slice(-4)}
                                </span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Select Accounts for Credit Scoring
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        This is a one-time selection. Choose the MetaMask accounts you want to use for your DeFi credit score calculation.
                    </AlertDescription>
                </Alert>

                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-3">
                    {availableAccounts.map((acc) => (
                        <div key={acc} className="flex items-center space-x-3 p-3 border rounded-lg">
                            <Checkbox
                                checked={selectedAccounts.includes(acc)}
                                onCheckedChange={() => handleAccountToggle(acc)}
                                disabled={hasAlreadySelected}
                            />
                            <div className="flex-1">
                                <p className="font-mono text-sm">{acc}</p>
                                <p className="text-xs text-gray-500">
                                    Balance will be included in credit calculation
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-600">
                        Selected: {selectedAccounts.length} account(s)
                    </p>
                    <Button
                        onClick={handleSubmitSelection}
                        disabled={isLoading || selectedAccounts.length === 0}
                    >
                        {isLoading ? 'Submitting...' : 'Confirm Selection'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}