// SignatureNullifierGenerator.tsx -> generating signatures, and nullifiers from those signatures
// NOTE: ethereum signatures use + 27/28 for the last byte (v value), but we normalize to 0/1 for RISC Zero compatibility. This matches the original nullifiers.json format.
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { 
    Shield, 
    Download, 
    Copy, 
    CheckCircle, 
    AlertCircle, 
    Loader2,
    Wallet,
    FileText,
    Users
} from 'lucide-react';

interface AccountResult {
    account: string;
    signature: string | null;
    nullifier: number[] | null;
    nullifierHex?: string;
    index: number;
    timestamp: number;
    success: boolean;
    error?: string;
}

interface ProcessingResults {
    metadata: {
        message: string;
        totalAccounts: number;
        successfulAccounts: number;
        failedAccounts: number;
        timestamp: number;
        version: string;
        platform: string;
        algorithm: string;
    };
    accounts: {
        successful: AccountResult[];
        failed: AccountResult[];
        all: AccountResult[];
    };
    user_owned_addresses: string[];
    signatures: number[][];
    nullifiers: number[][];
    all_merkle_proofs: any;
    concatenated: any;
    risc0Data: any;
}

interface Props {
    account: string;
    contracts?: any;
    provider: any;
}

export function SignatureNullifierGenerator({ account, provider }: Props) {
    const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [accountBalances, setAccountBalances] = useState<{[address: string]: string}>({});
    const [loadingBalances, setLoadingBalances] = useState<boolean>(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [results, setResults] = useState<ProcessingResults | null>(null);
    const [processingStep, setProcessingStep] = useState<string>('');
    const [completedAccounts, setCompletedAccounts] = useState<number>(0);
    const [showResults, setShowResults] = useState<boolean>(false);

    // Fixed message as per RISC Zero specification, always "Block 2"
    const SIGNATURE_MESSAGE = "Block 2";

    // Test function to verify nullifier generation against known values (for debugging purposes, not used anymore)
    const verifyAgainstKnownNullifier = async (expectedNullifier: number[], accountAddress: string, signature: string) => {
        const generated = await generateNullifierForAccount(accountAddress, signature);
        const matches = JSON.stringify(generated.nullifier) === JSON.stringify(expectedNullifier);
        console.log('=== NULLIFIER VERIFICATION ===');
        console.log('Expected:', expectedNullifier);
        console.log('Generated:', generated.nullifier);
        console.log('Match:', matches);
        console.log('Account used:', accountAddress);
        console.log('Signature used:', signature);
        console.log('==============================');
        return matches;
    };

    useEffect(() => {
        loadAvailableAccounts();
    }, []);

    const loadAccountBalances = async (accounts: string[]) => {
        if (!provider || accounts.length === 0) return;
        
        setLoadingBalances(true);
        const balances: {[address: string]: string} = {};
        
        try {
            await Promise.all(
                accounts.map(async (accountAddr) => {
                    try {
                        const balance = await provider.getBalance(accountAddr);
                        balances[accountAddr] = ethers.formatEther(balance);
                    } catch (err) {
                        console.error(`Failed to get balance for ${accountAddr}:`, err);
                        balances[accountAddr] = "Error";
                    }
                })
            );
            setAccountBalances(balances);
        } catch (err) {
            console.error('Failed to load account balances:', err);
        } finally {
            setLoadingBalances(false);
        }
    };

    const loadAvailableAccounts = async () => {
        if (!window.ethereum) {
            setError('MetaMask not detected');
            return;
        }

        try {
            // Request account access
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            
            setAvailableAccounts(accounts);
            
            // Load balances for all accounts
            await loadAccountBalances(accounts);
            
            // Auto-select current account if available
            if (accounts.includes(account)) {
                setSelectedAccounts([account]);
            }
        } catch (err) {
            const error = err as Error;
            setError('Failed to load MetaMask accounts: ' + error.message);
        }
    };

    const handleAccountToggle = (accountAddress: string) => {
        setSelectedAccounts(prev => {
            if (prev.includes(accountAddress)) {
                return prev.filter(addr => addr !== accountAddress);
            } else {
                return [...prev, accountAddress];
            }
        });
    };

    const selectAllAccounts = () => {
        setSelectedAccounts([...availableAccounts]);
    };

    const clearSelection = () => {
        setSelectedAccounts([]);
    };

    // Test with standard Hardhat accounts to match original nullifiers -> easy selection of hardhat/anvil accounts (they are same)
    const testStandardAccounts = () => {
        const standardHardhatAccounts = [
            '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Account #0
            '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // Account #1  
            '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // Account #2
            '0x90f79bf6eb2c4f870365e785982e1f101e93b906', // Account #3
            '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65', // Account #4
        ];
        
        // Filter to only include accounts that are actually available in MetaMask
        const availableStandardAccounts = standardHardhatAccounts.filter(addr => 
            availableAccounts.includes(addr)
        );
        
        setSelectedAccounts(availableStandardAccounts);
        
        if (availableStandardAccounts.length > 0) {
            console.log('Selected standard Hardhat accounts:', availableStandardAccounts);
        } else {
            alert('No standard Hardhat test accounts found in MetaMask. Make sure you\'re connected to the right network and have imported the test accounts.');
        }
    };

    // Generate nullifier using SHA256(address_bytes + signature_bytes) to match Rust implementation
    const generateNullifierForAccount = async (accountAddress: string, signature: string): Promise<{
        nullifier: number[];
        nullifierHex: string;
        account: string;
    }> => {
        try {
            console.log('=== NULLIFIER GENERATION DEBUG ===');
            console.log('Account:', accountAddress);
            console.log('Original Signature:', signature);
            console.log('Signature length (with 0x):', signature.length);
            
            // IMPORTANT: Use NORMALIZED signature bytes (with v=0/1) for nullifier generation
            // This matches the original nullifiers.json file format. In ethereum signatures, the typical v value is +27
            
            // Convert address to bytes (remove 0x prefix and convert to Uint8Array)
            const addressMatch = accountAddress.slice(2).match(/.{2}/g);
            if (!addressMatch) throw new Error('Invalid address format');
            
            const addressBytes = new Uint8Array(
                addressMatch.map(byte => parseInt(byte, 16))
            );
            console.log('Address bytes:', Array.from(addressBytes));
            console.log('Address bytes length:', addressBytes.length);
            
            // Convert signature to bytes (remove 0x prefix and convert to Uint8Array)  
            // NORMALIZE v value here for nullifier generation to match original files
            const signatureMatch = signature.slice(2).match(/.{2}/g);
            if (!signatureMatch) throw new Error('Invalid signature format');
            
            const signatureBytes = new Uint8Array(
                signatureMatch.map(byte => parseInt(byte, 16))
            );
            
            // Normalize the v value (last byte) from Ethereum's 27/28 to standard 0/1
            if (signatureBytes.length === 65) { // Standard signature length (32 + 32 + 1 bytes)
                const lastByte = signatureBytes[64]; // v value
                if (lastByte === 27) {
                    signatureBytes[64] = 0;
                } else if (lastByte === 28) {
                    signatureBytes[64] = 1;
                }
                console.log(`Normalized v value for nullifier: ${lastByte} -> ${signatureBytes[64]}`);
            }
            
            console.log('Signature bytes (normalized for nullifier):', Array.from(signatureBytes));
            console.log('Signature bytes length:', signatureBytes.length);
            console.log('V value (last byte, normalized):', signatureBytes[64]);
            
            // Concatenate address_bytes + signature_bytes (like the Rust implementation)
            const combined = new Uint8Array(addressBytes.length + signatureBytes.length);
            combined.set(addressBytes, 0);
            combined.set(signatureBytes, addressBytes.length);
            console.log('Combined length:', combined.length, '(should be 85: 20 address + 65 signature)');
            console.log('Combined first 10 bytes:', Array.from(combined.slice(0, 10)));
            console.log('Combined last 10 bytes:', Array.from(combined.slice(-10)));
            
            // Calculate SHA256 hash - same algorithm used in rust
            const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            console.log('Generated nullifier (SHA256):', hashArray);
            console.log('Nullifier length:', hashArray.length, '(should be 32)');
            
            const result = {
                nullifier: hashArray,
                nullifierHex: '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join(''),
                account: accountAddress
            };
            console.log('Final nullifier hex:', result.nullifierHex);
            console.log('=== END NULLIFIER DEBUG ===\n');
            
            return result;
        } catch (error) {
            console.error('Error generating nullifier:', error);
            throw error;
        }
    };

    // Main processing function
    const processMultipleAccounts = async () => {
        if (selectedAccounts.length === 0) {
            setError('Please select at least one account');
            return;
        }

        setIsProcessing(true);
        setError('');
        setResults(null);
        setCompletedAccounts(0);
        
        const successfulResults: AccountResult[] = [];
        const failedResults: AccountResult[] = [];
        const concatenatedSignatures: string[] = [];
        const concatenatedNullifiers: number[][] = [];

        try {
            setProcessingStep('Starting signature process...');
            
            for (let i = 0; i < selectedAccounts.length; i++) {
                const accountAddress = selectedAccounts[i];
                setProcessingStep(`Processing account ${i + 1}/${selectedAccounts.length}: ${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`);

                try {
                    // Check if this is the currently active account
                    const currentSigner = await provider.getSigner();
                    const currentSignerAddress = await currentSigner.getAddress();
                    
                    if (currentSignerAddress.toLowerCase() === accountAddress.toLowerCase()) {
                        // Current account - can sign directly
                        setProcessingStep(`Signing with current account: ${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`);
                        
                        const signature = await currentSigner.signMessage(SIGNATURE_MESSAGE);
                        
                        // Generate nullifier for this account using the ORIGINAL signature (before normalization)
                        const nullifierData = await generateNullifierForAccount(accountAddress, signature);
                        
                        // Store successful result
                        const accountResult: AccountResult = {
                            account: accountAddress,
                            signature: signature,
                            nullifier: nullifierData.nullifier,
                            nullifierHex: nullifierData.nullifierHex,
                            index: i,
                            timestamp: Date.now(),
                            success: true
                        };
                        
                        successfulResults.push(accountResult);
                        concatenatedSignatures.push(signature);
                        concatenatedNullifiers.push(nullifierData.nullifier); // This is already a 32-byte array
                        
                    } else {
                        // NOTE: Different account - need user to switch manually. Metamask does not allow signing with a different account directly. user has to switch manually, and the loop continues after the switch
                        setProcessingStep(`Waiting for account switch to ${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`);
                        
                        // Show modal asking user to switch accounts; again, metamask limitation
                        const userConfirmed = await new Promise((resolve) => {
                            const confirmSwitch = window.confirm(
                                `Please switch MetaMask to account ${accountAddress} and click OK to continue.\n\n` +
                                `Current account: ${currentSignerAddress}\n` +
                                `Required account: ${accountAddress}\n\n` +
                                `Click OK after switching, or Cancel to skip this account.`
                            );
                            resolve(confirmSwitch);
                        });
                        
                        if (!userConfirmed) {
                            throw new Error('User skipped account switch');
                        }
                        
                        // Wait a moment for account switch
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Re-check the current account, make sure it matches the expected one
                        const newProvider = new ethers.BrowserProvider(window.ethereum);
                        const newSigner = await newProvider.getSigner();
                        const newSignerAddress = await newSigner.getAddress();
                        
                        if (newSignerAddress.toLowerCase() !== accountAddress.toLowerCase()) {
                            throw new Error(`Account switch failed. Expected ${accountAddress}, got ${newSignerAddress}`);
                        }
                        
                        setProcessingStep(`Signing with switched account: ${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`);
                        
                        // Now sign with the correct account
                        const signature = await newSigner.signMessage(SIGNATURE_MESSAGE);
                        
                        // Generate nullifier using SHA256 to match Rust backend - using ORIGINAL signature
                        const nullifierData = await generateNullifierForAccount(accountAddress, signature);
                        
                        // Store successful result
                        const accountResult: AccountResult = {
                            account: accountAddress,
                            signature: signature,
                            nullifier: nullifierData.nullifier, // 32-byte array
                            nullifierHex: nullifierData.nullifierHex, // hex string for display
                            index: i,
                            timestamp: Date.now(),
                            success: true
                        };
                        
                        successfulResults.push(accountResult);
                        concatenatedSignatures.push(signature);
                        concatenatedNullifiers.push(nullifierData.nullifier);
                    }
                    
                    setCompletedAccounts(i + 1);
                    
                } catch (accountError) {
                    console.error(`Failed to process account ${accountAddress}:`, accountError);
                    
                    const error = accountError as Error;
                    failedResults.push({
                        account: accountAddress,
                        signature: null,
                        nullifier: null,
                        index: i,
                        error: error.message,
                        timestamp: Date.now(),
                        success: false
                    });
                    
                    setCompletedAccounts(i + 1);
                }
            }

            // Create final results object matching the required JSON formats
            const finalResults = {
                metadata: {
                    message: SIGNATURE_MESSAGE,
                    totalAccounts: selectedAccounts.length,
                    successfulAccounts: successfulResults.length,
                    failedAccounts: failedResults.length,
                    timestamp: Date.now(),
                    version: '1.0.0',
                    platform: 'DeFi-MultiAccount-Nullifier',
                    algorithm: 'SHA256(address_bytes + signature_bytes)'
                },
                accounts: {
                    successful: successfulResults,
                    failed: failedResults,
                    all: [...successfulResults, ...failedResults]
                },
                
                // Generate the 4 required JSON formats:
                
                // 1. user_owned_addresses.json format MATCHES
                user_owned_addresses: successfulResults.map(r => r.account),
                
                // 2. signatures.json format (as 2D array of bytes) MATCHES
                signatures: concatenatedSignatures.map(sig => {
                    if (!sig || typeof sig !== 'string') return [];
                    try {
                        const matchResult = sig.slice(2).match(/.{2}/g);
                        if (!matchResult) return [];
                        const bytes = matchResult.map(byte => parseInt(byte, 16));
                        
                        // Normalize the v value (last byte) from Ethereum's 27/28 to standard 0/1
                        if (bytes.length === 65) { // Standard signature length (32 + 32 + 1 bytes)
                            const lastByte = bytes[64]; // v value
                            if (lastByte === 27) {
                                bytes[64] = 0;
                            } else if (lastByte === 28) {
                                bytes[64] = 1;
                            }
                            console.log(`Normalized signature v value: ${lastByte} -> ${bytes[64]}`);
                        }
                        
                        return bytes;
                    } catch (e) {
                        console.error('Error processing signature:', sig, e);
                        return [];
                    }
                }),
                
                // 3. nullifiers.json format (as 2D array of bytes) MATCHES
                nullifiers: (() => {
                    console.log('Processing nullifiers for JSON output. Count:', concatenatedNullifiers.length);
                    console.log('Sample nullifier:', concatenatedNullifiers[0]);
                    const validNullifiers = concatenatedNullifiers.filter(n => {
                        const isValid = n && Array.isArray(n) && n.length === 32;
                        if (!isValid) {
                            console.warn('Invalid nullifier found:', n);
                        }
                        return isValid;
                    });
                    console.log('Valid nullifiers count:', validNullifiers.length);
                    return validNullifiers;
                })(),
                
                // 4. all_merkle_proofs.json structure (using hardcoded placeholder values right now - will be populated later)
                //TODO: need additional fields to match the original all_merkle_proofs.json format
                all_merkle_proofs: {
                    user_history_proof: {
                        contract_address: "0x0000000000000000000000000000000000000000", // To be filled, will use the address jsons to get the liquidityPool addr
                        user_address: successfulResults.length > 0 ? successfulResults[0].account : "",
                        block_number: "0", // To be filled
                        user_history: {
                            first_interaction_timestamp: "0x0",
                            liquidations: "0x0", 
                            successful_payments: "0x0"
                        },
                        storage_slots: [],
                        state_root: "0x0000000000000000000000000000000000000000000000000000000000000000",
                        metadata: {
                            fetched_at: new Date().toISOString(),
                            rpc_url: "TBD",
                            message: SIGNATURE_MESSAGE
                        }
                    },
                    owned_accounts_merkle_proofs: [] // To be filled with actual merkle proofs
                },
                

                // Legacy format for backward compatibility
                concatenated: {
                    signatures: concatenatedSignatures,
                    nullifiers: concatenatedNullifiers.map(n => {
                        if (!n) return '0x0';
                        if (Array.isArray(n)) {
                            return '0x' + n.map(b => b.toString(16).padStart(2, '0')).join('');
                        }
                        return typeof n === 'string' ? n : '0x0';
                    }),
                    // Binary concatenation for RISC0 compatibility
                    signaturesBinary: concatenatedSignatures.map(s => {
                        if (!s || typeof s !== 'string') return '';
                        // Convert signature and normalize v value
                        const hexString = s.slice(2); // Remove 0x prefix
                        if (hexString.length === 130) { // 65 bytes * 2 hex chars = 130
                            // Extract v value (last byte)
                            const vHex = hexString.slice(-2);
                            const vValue = parseInt(vHex, 16);
                            
                            let normalizedVHex = vHex;
                            if (vValue === 27) {
                                normalizedVHex = '00';
                            } else if (vValue === 28) {
                                normalizedVHex = '01';
                            }
                            
                            // Replace the last byte with normalized value
                            return hexString.slice(0, -2) + normalizedVHex;
                        }
                        return hexString;
                    }).join(''),
                    nullifiersBinary: concatenatedNullifiers.map(n => {
                        if (!n) return '';
                        if (Array.isArray(n)) {
                            return n.map(b => b.toString(16).padStart(2, '0')).join('');
                        }
                        return '';
                    }).join('')
                },
                
                // RISC0 specific data structure
                risc0Data: {
                    accountNullifiers: successfulResults.map(result => ({
                        account: result.account,
                        nullifier: result.nullifier, // 32-byte array
                        nullifierHex: result.nullifierHex,
                        signature: result.signature
                    })),
                    merkleRoot: (() => {
                        try {
                            const hexNullifiers = concatenatedNullifiers
                                .filter(n => n && Array.isArray(n))
                                .map(n => '0x' + n.map(b => b.toString(16).padStart(2, '0')).join(''));
                            return hexNullifiers.length > 0 ? calculateSimpleMerkleRoot(hexNullifiers) : '0x0';
                        } catch (e) {
                            console.error('Error calculating merkle root:', e);
                            return '0x0';
                        }
                    })(),
                    accountsHash: (() => {
                        try {
                            const addresses = successfulResults.map(r => r.account);
                            return addresses.length > 0 ? 
                                ethers.keccak256(ethers.solidityPacked(['address[]'], [addresses])) : 
                                '0x0';
                        } catch (e) {
                            console.error('Error calculating accounts hash:', e);
                            return '0x0';
                        }
                    })(),
                    message: SIGNATURE_MESSAGE,
                    algorithm: 'SHA256'
                }
            };

            setResults(finalResults);
            setShowResults(true);
            setProcessingStep('✅ Processing complete!');
            
        } catch (error) {
            console.error('Processing failed:', error);
            const err = error as Error;
            setError('Processing failed: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // Simple Merkle root calculation for verification - this is a basic implementation, not done
    const calculateSimpleMerkleRoot = (nullifiers: string[]): string => {
        if (nullifiers.length === 0) return ethers.ZeroHash;
        if (nullifiers.length === 1) return nullifiers[0];
        
        let hashes: string[] = [...nullifiers];
        
        while (hashes.length > 1) {
            const newHashes: string[] = [];
            for (let i = 0; i < hashes.length; i += 2) {
                if (i + 1 < hashes.length) {
                    newHashes.push(
                        ethers.keccak256(
                            ethers.solidityPacked(['bytes32', 'bytes32'], [hashes[i], hashes[i + 1]])
                        )
                    );
                } else {
                    newHashes.push(hashes[i]);
                }
            }
            hashes = newHashes;
        }
        
        return hashes[0];
    };

    // Download individual JSON files matching the exact format requirements
    const downloadIndividualFiles = () => {
        if (!results) return;
        
        // 1. Download user_owned_addresses.json
        downloadJSONFile(results.user_owned_addresses, 'user_owned_addresses.json');
        
        // 2. Download signatures.json  
        downloadJSONFile(results.signatures, 'signatures.json');
        
        // 3. Download nullifiers.json
        downloadJSONFile(results.nullifiers, 'nullifiers.json');
        
        // 4. Download all_merkle_proofs.json
        downloadJSONFile(results.all_merkle_proofs, 'all_merkle_proofs.json');
    };

    // Download complete results as single JSON file
    const downloadResults = () => {
        if (!results) return;
        
        const jsonString = JSON.stringify(results, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `defi_signatures_nullifiers_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    
    // Helper function to download individual JSON files
    const downloadJSONFile = (data: any, filename: string) => {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Copy results to clipboard
    const copyResults = async () => {
        if (!results) return;
        
        try {
            await navigator.clipboard.writeText(JSON.stringify(results, null, 2));
            // Could add a toast notification here
            alert('Results copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    // Reset component state
    const resetComponent = () => {
        setResults(null);
        setShowResults(false);
        setSelectedAccounts([]);
        setError('');
        setProcessingStep('');
        setCompletedAccounts(0);
    };

    const formatAddress = (address: string) => {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const formatBalance = (balance: string) => {
        if (!balance || balance === "Error") return balance;
        const num = parseFloat(balance);
        if (num === 0) return "0 ETH";
        if (num < 0.001) return "<0.001 ETH";
        if (num < 1) return `${num.toFixed(4)} ETH`;
        return `${num.toFixed(3)} ETH`;
    };

    return (
        <Card className="w-full max-w-4xl mx-auto">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-6 w-6 text-blue-600" />
                    Multi-Account Signature & Nullifier Generator
                </CardTitle>
                <p className="text-sm text-gray-600">
                    Generate cryptographic signatures and nullifiers for multiple accounts for DeFi credit scoring
                </p>
            </CardHeader>
            
            <CardContent className="space-y-6">
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {!showResults ? (
                    <>
                        {/* Account Selection */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-medium flex items-center gap-2">
                                    <Users className="h-5 w-5" />
                                    Select Accounts
                                </h3>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={selectAllAccounts}>
                                        Select All
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={testStandardAccounts}>
                                        Test Accounts
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={clearSelection}>
                                        Clear
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={loadAvailableAccounts} disabled={loadingBalances}>
                                        {loadingBalances ? (
                                            <>
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                Loading
                                            </>
                                        ) : (
                                            "Refresh"
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {availableAccounts.length === 0 ? (
                                <Alert>
                                    <Wallet className="h-4 w-4" />
                                    <AlertDescription>
                                        No MetaMask accounts found. Please ensure MetaMask is connected.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <div className="grid gap-3">
                                    {availableAccounts.map((accountAddr) => (
                                        <div key={accountAddr} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                                            <Checkbox
                                                checked={selectedAccounts.includes(accountAddr)}
                                                onCheckedChange={() => handleAccountToggle(accountAddr)}
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-mono text-sm">{accountAddr}</p>
                                                        {accountAddr === account && (
                                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                                Current
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {loadingBalances ? (
                                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                                Loading...
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm font-medium text-gray-600">
                                                                {formatBalance(accountBalances[accountAddr] || "0")}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center justify-between text-sm text-gray-600">
                                <span>Selected: {selectedAccounts.length} account(s)</span>
                                <div className="flex items-center gap-4">
                                    <span>
                                        Total Balance: {
                                            loadingBalances ? (
                                                <Loader2 className="h-3 w-3 animate-spin inline ml-1" />
                                            ) : (
                                                formatBalance(
                                                    selectedAccounts
                                                        .map(addr => parseFloat(accountBalances[addr] || "0"))
                                                        .reduce((sum, balance) => sum + balance, 0)
                                                        .toString()
                                                )
                                            )
                                        }
                                    </span>
                                    <span>Each account = 1 unique nullifier</span>
                                </div>
                            </div>
                        </div>

                        {/* Processing Status */}
                        {isProcessing && (
                            <Alert>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <AlertDescription>
                                    <div>
                                        <p className="font-medium">{processingStep}</p>
                                        <p className="text-xs mt-1">
                                            Progress: {completedAccounts}/{selectedAccounts.length} accounts completed
                                        </p>
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Generate Button */}
                        <div className="flex gap-4">
                            <Button 
                                onClick={processMultipleAccounts}
                                disabled={isProcessing || selectedAccounts.length === 0}
                                className="flex-1"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Shield className="h-4 w-4 mr-2" />
                                        Generate Signatures & Nullifiers
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Information Panel */}
                        <Alert>
                            <FileText className="h-4 w-4" />
                            <AlertDescription>
                                <div className="space-y-1">
                                    <p className="font-medium">RISC Zero Compatible Nullifier Generation:</p>
                                    <ul className="text-xs space-y-1 list-disc list-inside">
                                        <li>Fixed message: <code className="bg-gray-100 px-1 rounded">"Block 2"</code></li>
                                        <li>Algorithm: <code className="bg-gray-100 px-1 rounded">SHA256(address_bytes + signature_bytes)</code></li>
                                        <li>Output: 32-byte nullifiers matching original nullifiers.json</li>
                                        <li><strong>Important:</strong> Both nullifiers and signatures use normalized v=0/1</li>
                                        <li><strong>Manual Account Switching:</strong> Switch MetaMask accounts when prompted</li>
                                        <li>Generates 4 JSON files matching RISC Zero input requirements (all_merkle_proofs.json work in progress)</li>
                                    </ul>
                                </div>
                            </AlertDescription>
                        </Alert>
                    </>
                ) : (
                    /* Results Display */
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                Results Generated
                            </h3>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={downloadResults}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download All
                                </Button>
                                <Button variant="outline" onClick={downloadIndividualFiles}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    Download Separate Files
                                </Button>
                                <Button variant="outline" onClick={copyResults}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy
                                </Button>
                                <Button variant="outline" onClick={resetComponent}>
                                    Reset
                                </Button>
                            </div>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center p-4 border rounded-lg">
                                <p className="text-2xl font-bold text-green-600">{results?.metadata.successfulAccounts}</p>
                                <p className="text-sm text-gray-600">Successful</p>
                            </div>
                            <div className="text-center p-4 border rounded-lg">
                                <p className="text-2xl font-bold text-red-600">{results?.metadata.failedAccounts}</p>
                                <p className="text-sm text-gray-600">Failed</p>
                            </div>
                            <div className="text-center p-4 border rounded-lg">
                                <p className="text-2xl font-bold text-blue-600">{results?.metadata.totalAccounts}</p>
                                <p className="text-sm text-gray-600">Total</p>
                            </div>
                        </div>

                        {/* Account Results Table */}
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="text-left p-3 text-sm font-medium">Account</th>
                                        <th className="text-left p-3 text-sm font-medium">Nullifier</th>
                                        <th className="text-left p-3 text-sm font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results?.accounts.all.map((result, index) => (
                                        <tr key={index} className="border-t">
                                            <td className="p-3 font-mono text-sm">
                                                {formatAddress(result.account)}
                                            </td>
                                            <td className="p-3 font-mono text-xs">
                                                {result.nullifier ? 
                                                    (Array.isArray(result.nullifier) ? 
                                                        `[${result.nullifier.slice(0,3).join(',')}...]` :
                                                        formatAddress(result.nullifierHex || 'N/A')
                                                    ) : 'N/A'}
                                            </td>
                                            <td className="p-3">
                                                {result.success ? (
                                                    <Badge className="bg-green-100 text-green-800">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        Success
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="destructive">
                                                        <AlertCircle className="h-3 w-3 mr-1" />
                                                        Failed
                                                    </Badge>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* RISC0 Data Preview */}
                        <Alert>
                            <Shield className="h-4 w-4" />
                            <AlertDescription>
                                <div className="space-y-2">
                                    <p className="font-medium">RISC0 Integration Ready - SHA256 Nullifiers</p>
                                    <div className="grid grid-cols-2 gap-4 text-xs">
                                        <div>
                                            <p className="font-medium">Message Used:</p>
                                            <p className="font-mono">{SIGNATURE_MESSAGE}</p>
                                        </div>
                                        <div>
                                            <p className="font-medium">Algorithm:</p>
                                            <p className="font-mono">SHA256(addr + sig)</p>
                                        </div>
                                        <div>
                                            <p className="font-medium">Accounts Hash:</p>
                                            <p className="font-mono break-all">{formatAddress(results?.risc0Data.accountsHash || 'N/A')}</p>
                                        </div>
                                        <div>
                                            <p className="font-medium">Nullifiers Generated:</p>
                                            <p className="font-mono">{results?.nullifiers.length || 0} accounts</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 p-2 bg-green-50 rounded text-xs">
                                        <span className="inline-flex items-center font-medium text-green-800">
                                            <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                                            Original RISC Zero Files Compatible
                                        </span>
                                        <p className="text-green-600">
                                            Generated using exact same algorithm as original nullifiers.json
                                        </p>
                                        <span className="inline-flex items-center text-blue-600 mt-1">
                                            <Shield className="h-4 w-4 mr-1" />
                                            Both nullifiers and signatures.json use normalized signatures (v=0/1)
                                        </span>
                                    </div>
                                    <div className="mt-2">
                                        <p className="text-xs font-medium">Output Files Ready:</p>
                                        <ul className="text-xs list-disc list-inside ml-2">
                                            <li>user_owned_addresses.json</li>
                                            <li>signatures.json (byte arrays)</li> 
                                            <li>nullifiers.json (32-byte arrays)</li>
                                            <li>all_merkle_proofs.json (template)</li>
                                        </ul>
                                    </div>
                                </div>
                            </AlertDescription>
                        </Alert>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default SignatureNullifierGenerator;