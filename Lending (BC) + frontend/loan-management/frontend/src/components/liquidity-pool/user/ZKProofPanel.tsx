import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { ethers, Contract } from "ethers"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
    Shield, 
    FileCheck, 
    Upload, 
    CheckCircle, 
    XCircle, 
    AlertTriangle, 
    RefreshCw,
    User,
    CreditCard,
    GitBranch,
    Eye,
    EyeOff
} from "lucide-react"

interface ZKProofPanelProps {
    contract: Contract;
    account: string;
}

type ProofType = 'account' | 'tradfi' | 'nesting';

interface ZKVerificationStatus {
    hasTradFi: boolean;
    hasAccount: boolean;
    hasNesting: boolean;
    finalScore: number;
    isEligible: boolean;
}

export function ZKProofPanel({ contract, account }: ZKProofPanelProps) {
    const [selectedProofType, setSelectedProofType] = useState<ProofType>('account')
    const [receiptFile, setReceiptFile] = useState<File | null>(null)
    const [journalData, setJournalData] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [zkStatus, setZKStatus] = useState<ZKVerificationStatus | null>(null)
    const [creditSystemAddress, setCreditSystemAddress] = useState<string>('')
    const [showRawData, setShowRawData] = useState(false)

    // Sample journal data for each proof type
    const sampleJournalData = {
        account: JSON.stringify({
            account: account,
            nonce: 150,
            balance: "2500000000000000000", // 2.5 ETH in wei
            storageRoot: "0x" + "a".repeat(64),
            codeHash: "0x" + "b".repeat(64),
            blockNumber: 123456,
            stateRoot: "0x" + "c".repeat(64)
        }, null, 2),
        tradfi: JSON.stringify({
            creditScore: "750",
            dataSource: "experian.com",
            reportDate: "2024-01-15",
            accountAge: "5",
            paymentHistory: "excellent"
        }, null, 2),
        nesting: JSON.stringify({
            account: account,
            defiScore: 85,
            tradfiScore: 750,
            hybridScore: 82,
            timestamp: Math.floor(Date.now() / 1000)
        }, null, 2)
    }

    useEffect(() => {
        if (contract && account) {
            getCreditSystemAddress()
            // Only fetch ZK status if we have a credit system address
            if (creditSystemAddress && creditSystemAddress !== null) {
                fetchZKStatus()
            }
        }
    }, [contract, account, creditSystemAddress])

    // If credit system is not available, render a simple message instead of crashing
    if (creditSystemAddress === null) {
        return (
            <div className="bg-gray-100 p-4 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">ZK Proof System</h3>
                <p className="text-gray-600">ZK proof system not available in this deployment.</p>
            </div>
        )
    }

    useEffect(() => {
        // Autofill sample data when proof type changes
        setJournalData(sampleJournalData[selectedProofType])
    }, [selectedProofType, account])

    const getCreditSystemAddress = async () => {
        try {
            // Try to get credit system address from the contract
            // Note: creditSystem() function may not exist, use fallback
            if (contract.creditSystem && typeof contract.creditSystem === 'function') {
                const address = await contract.creditSystem()
                setCreditSystemAddress(address)
            } else {
                // Fallback: Use the deployed IntegratedCreditSystem address from addresses
                const addresses = await import('../../../addresses.json')
                if (addresses.IntegratedCreditSystem) {
                    setCreditSystemAddress(addresses.IntegratedCreditSystem)
                } else {
                    console.log('Credit system not available - ZK proofs disabled')
                    setCreditSystemAddress(null)
                }
            }
        } catch (err) {
            console.error('Failed to get credit system address:', err)
            // Try fallback
            try {
                const addresses = await import('../../../addresses.json')
                if (addresses.IntegratedCreditSystem) {
                    setCreditSystemAddress(addresses.IntegratedCreditSystem)
                }
            } catch (fallbackErr) {
                console.error('Fallback also failed:', fallbackErr)
                setCreditSystemAddress(null)
            }
        }
    }

    const fetchZKStatus = async () => {
        try {
            // Check if the function exists before calling it
            if (contract && contract.getZKVerificationStatus && typeof contract.getZKVerificationStatus === 'function') {
                const status = await contract.getZKVerificationStatus(account)
                setZKStatus({
                    hasTradFi: status[0],
                    hasAccount: status[1],
                    hasNesting: status[2],
                    finalScore: Number(status[3]),
                    isEligible: status[4]
                })
            } else {
                // Function doesn't exist, set default values
                console.log('ZK verification functions not available on this contract')
                setZKStatus({
                    hasTradFi: false,
                    hasAccount: false,
                    hasNesting: false,
                    finalScore: 0,
                    isEligible: false
                })
            }
        } catch (err) {
            console.error('Failed to fetch ZK status:', err)
            // Set default values instead of crashing
            setZKStatus({
                hasTradFi: false,
                hasAccount: false,
                hasNesting: false,
                finalScore: 0,
                isEligible: false
            })
        }
    }

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            if (file.name.endsWith('.bin') || file.name.includes('receipt')) {
                setReceiptFile(file)
                setError('')
            } else {
                setError('Please upload a .bin file (receipt.bin)')
                setReceiptFile(null)
            }
        }
    }

    const handleSubmitProof = async () => {
        if (!receiptFile) {
            setError('Please upload a receipt.bin file')
            return
        }

        if (!journalData.trim()) {
            setError('Please provide journal data')
            return
        }

        setIsLoading(true)
        setError('')
        setSuccess('')

        try {
            // read the receipt file as bytes
            const receiptArrayBuffer = await receiptFile.arrayBuffer()
            const receiptBytes = new Uint8Array(receiptArrayBuffer)
            
            // Convert journal data to bytes
            let journalBytes: Uint8Array
            
            try {
                // Try to parse as JSON first, then encode
                const journalObj = JSON.parse(journalData)
                
                if (selectedProofType === 'account') {
                    // Encode account proof data
                    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256", "uint256", "bytes32", "bytes32", "uint256", "bytes32"],
                        [
                            journalObj.account,
                            journalObj.nonce,
                            journalObj.balance,
                            journalObj.storageRoot,
                            journalObj.codeHash,
                            journalObj.blockNumber,
                            journalObj.stateRoot
                        ]
                    )
                    journalBytes = ethers.getBytes(encoded)
                } else if (selectedProofType === 'tradfi') {
                    // Encode TradFi proof data
                    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
                        ["string", "string", "string", "string", "string"],
                        [
                            journalObj.creditScore,
                            journalObj.dataSource,
                            journalObj.reportDate,
                            journalObj.accountAge,
                            journalObj.paymentHistory
                        ]
                    )
                    journalBytes = ethers.getBytes(encoded)
                } else if (selectedProofType === 'nesting') {
                    // Encode nesting proof data
                    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256", "uint256", "uint256", "uint256"],
                        [
                            journalObj.account,
                            journalObj.defiScore,
                            journalObj.tradfiScore,
                            journalObj.hybridScore,
                            journalObj.timestamp
                        ]
                    )
                    journalBytes = ethers.getBytes(encoded)
                } else {
                    throw new Error('Invalid proof type')
                }
            } catch (parseError) {
                // If JSON parsing fails, treat as raw bytes
                journalBytes = ethers.toUtf8Bytes(journalData)
            }

            // get credit system contract
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()
            
            // Credit system ABI for the specific functions we need
            const creditSystemABI = [
                "function submitAccountProof(bytes calldata seal, bytes calldata journalData) external",
                "function submitTradFiProof(bytes calldata seal, bytes calldata journalData) external", 
                "function submitNestingProof(bytes calldata seal, bytes calldata journalData) external"
            ]
            
            const creditSystemContract = new ethers.Contract(
                creditSystemAddress,
                creditSystemABI,
                signer
            )

            // Submit selectedProofType
            let tx
            if (selectedProofType === 'account') {
                tx = await creditSystemContract.submitAccountProof(receiptBytes, journalBytes)
            } else if (selectedProofType === 'tradfi') {
                tx = await creditSystemContract.submitTradFiProof(receiptBytes, journalBytes)
            } else if (selectedProofType === 'nesting') {
                tx = await creditSystemContract.submitNestingProof(receiptBytes, journalBytes)
            }

            await tx.wait()
            setSuccess(`${selectedProofType.toUpperCase()} proof submitted successfully!`)
            
            // Refresh ZK status
            setTimeout(() => {
                fetchZKStatus()
            }, 2000)

            // Clear form
            setReceiptFile(null)
            setJournalData(sampleJournalData[selectedProofType])
            
        } catch (err: any) {
            console.error('Failed to submit proof:', err)
            setError(`Failed to submit proof: ${err.message || 'Unknown error'}`)
        } finally {
            setIsLoading(false)
        }
    }

    const getProofIcon = (type: ProofType) => {
        switch (type) {
            case 'account':
                return <User className="h-4 w-4" />
            case 'tradfi':
                return <CreditCard className="h-4 w-4" />
            case 'nesting':
                return <GitBranch className="h-4 w-4" />
        }
    }

    const getStatusBadge = (verified: boolean) => {
        return verified ? (
            <Badge className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                Verified
            </Badge>
        ) : (
            <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                <XCircle className="h-3 w-3 mr-1" />
                Not Verified
            </Badge>
        )
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    ZK Proof Submission (RISC0 Testing)
                </CardTitle>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert className="mb-4 border-green-200 bg-green-50">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">{success}</AlertDescription>
                    </Alert>
                )}

                <Tabs defaultValue="status" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="status">Verification Status</TabsTrigger>
                        <TabsTrigger value="submit">Submit Proof</TabsTrigger>
                    </TabsList>

                    <TabsContent value="status">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-medium">Current ZK Verification Status</h3>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchZKStatus}
                                    disabled={isLoading}
                                >
                                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>

                            {zkStatus && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="p-4 border rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <User className="h-4 w-4" />
                                                    <span className="font-medium">Account Proof</span>
                                                </div>
                                                {getStatusBadge(zkStatus.hasAccount)}
                                            </div>
                                        </div>

                                        <div className="p-4 border rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <CreditCard className="h-4 w-4" />
                                                    <span className="font-medium">TradFi Proof</span>
                                                </div>
                                                {getStatusBadge(zkStatus.hasTradFi)}
                                            </div>
                                        </div>

                                        <div className="p-4 border rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <GitBranch className="h-4 w-4" />
                                                    <span className="font-medium">Nesting Proof</span>
                                                </div>
                                                {getStatusBadge(zkStatus.hasNesting)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-muted rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium">Final Credit Score</p>
                                                <p className="text-2xl font-bold">{zkStatus.finalScore}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-medium">Borrowing Eligibility</p>
                                                <div className="flex items-center gap-2">
                                                    {zkStatus.isEligible ? (
                                                        <Badge className="bg-green-100 text-green-800 border-green-200">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            Eligible
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-red-100 text-red-800 border-red-200">
                                                            <XCircle className="h-3 w-3 mr-1" />
                                                            Not Eligible
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="submit">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="proof-type">Proof Type</label>
                                <Select value={selectedProofType} onValueChange={(value: ProofType) => setSelectedProofType(value)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="account">
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4" />
                                                Account Proof
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="tradfi">
                                            <div className="flex items-center gap-2">
                                                <CreditCard className="h-4 w-4" />
                                                TradFi Proof
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="nesting">
                                            <div className="flex items-center gap-2">
                                                <GitBranch className="h-4 w-4" />
                                                Nesting Proof
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="receipt-upload">Receipt File (receipt.bin)</label>
                                <div className="relative">
                                    <Input
                                        id="receipt-upload"
                                        type="file"
                                        accept=".bin"
                                        onChange={handleFileUpload}
                                        className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                    />
                                    <Upload className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                                </div>
                                {receiptFile && (
                                    <p className="text-sm text-green-600 flex items-center gap-1">
                                        <FileCheck className="h-4 w-4" />
                                        {receiptFile.name} ({(receiptFile.size / 1024).toFixed(1)} KB)
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium" htmlFor="journal-data">Journal Data (JSON)</label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowRawData(!showRawData)}
                                    >
                                        {showRawData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        {showRawData ? 'Hide' : 'Show'} Raw Data
                                    </Button>
                                </div>
                                <textarea
                                    id="journal-data"
                                    value={journalData}
                                    onChange={(e) => setJournalData(e.target.value)}
                                    placeholder="Enter journal data as JSON..."
                                    rows={showRawData ? 12 : 6}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Sample data is pre-filled. Modify as needed for your test case.
                                </p>
                            </div>

                            <Button
                                onClick={handleSubmitProof}
                                disabled={isLoading || !receiptFile || !journalData.trim()}
                                className="w-full"
                            >
                                {isLoading ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                        Submitting Proof...
                                    </>
                                ) : (
                                    <>
                                        <Shield className="h-4 w-4 mr-2" />
                                        Submit {selectedProofType.toUpperCase()} Proof
                                    </>
                                )}
                            </Button>

                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <h4 className="font-medium text-blue-900 mb-2">For RISC0 Team:</h4>
                                <ul className="text-sm text-blue-800 space-y-1">
                                    <li>• Upload receipt.bin file generated by RISC0 proof system THIS WILL NOT BE NECESSARY?</li>
                                    <li>• Modify the journal data to match the proofs journal output</li>
                                    <li>• The system will automatically encode the data for on-chain verification</li>
                                    <li>• Check the verification status after successful submission</li>
                                </ul>
                                {creditSystemAddress && (
                                    <p className="text-xs text-blue-700 mt-2">
                                        Credit System: {creditSystemAddress}
                                    </p>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}