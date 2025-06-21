import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
    History, 
    ArrowUpDown, 
    ArrowDownUp, 
    Shield, 
    DollarSign, 
    Clock, 
    CheckCircle, 
    XCircle, 
    AlertTriangle,
    RefreshCw,
    Filter,
    ExternalLink,
    Download,
    Search
} from "lucide-react"
import { ethers } from "ethers"
import { 
    Transaction, 
    fetchTransactionHistory, 
    formatTransactionAmount, 
    formatTransactionTime 
} from "../../../utils/transactionUtils"

interface TransactionHistoryProps {
    contract: any
    account: string | null
    provider?: ethers.Provider
}

export function TransactionHistory({ contract, account, provider }: TransactionHistoryProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
    const [filter, setFilter] = useState<string>('all')
    const [searchTerm, setSearchTerm] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        if (account && contract && provider) {
            loadTransactionHistory()
        }
    }, [account, contract, provider])

    useEffect(() => {
        filterTransactions()
    }, [transactions, filter, searchTerm])

    const loadTransactionHistory = async () => {
        if (!account || !contract || !provider) return
        
        setIsLoading(true)
        setError("")
        
        try {
            const txHistory = await fetchTransactionHistory(contract, account, provider)
            setTransactions(txHistory)
            
            if (txHistory.length === 0) {
                setError("No transactions found for this account.")
            }
        } catch (err) {
            console.error("Error loading transactions:", err)
            setError("Failed to load transaction history. Please try again.")
            setTransactions([])
        } finally {
            setIsLoading(false)
        }
    }

    const filterTransactions = () => {
        let filtered = transactions

        // Filter by type
        if (filter !== 'all') {
            filtered = filtered.filter(tx => tx.type === filter)
        }

        // Filter by search term
        if (searchTerm) {
            filtered = filtered.filter(tx => 
                tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.amount.includes(searchTerm) ||
                (tx.token && tx.token.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (tx.hash && tx.hash.toLowerCase().includes(searchTerm.toLowerCase()))
            )
        }

        setFilteredTransactions(filtered)
    }

    const exportTransactions = () => {
        const csvContent = [
            ['Type', 'Amount', 'Token', 'Status', 'Description', 'Timestamp', 'Hash'],
            ...filteredTransactions.map(tx => [
                tx.type,
                tx.amount,
                tx.token || '',
                tx.status,
                tx.description,
                new Date(tx.timestamp).toISOString(),
                tx.hash || ''
            ])
        ].map(row => row.map(field => `"${field}"`).join(',')).join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `transaction-history-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
    }

    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'deposit':
                return <ArrowDownUp className="h-4 w-4 text-green-600" />
            case 'withdraw':
                return <ArrowUpDown className="h-4 w-4 text-blue-600" />
            case 'borrow':
                return <DollarSign className="h-4 w-4 text-purple-600" />
            case 'repay':
                return <DollarSign className="h-4 w-4 text-orange-600" />
            case 'lend':
                return <Shield className="h-4 w-4 text-indigo-600" />
            case 'liquidate':
                return <AlertTriangle className="h-4 w-4 text-red-600" />
            case 'interest':
                return <DollarSign className="h-4 w-4 text-green-600" />
            default:
                return <History className="h-4 w-4 text-gray-600" />
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'confirmed':
                return <Badge className="bg-green-100 text-green-800 border-green-200">Confirmed</Badge>
            case 'pending':
                return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending</Badge>
            case 'failed':
                return <Badge className="bg-red-100 text-red-800 border-red-200">Failed</Badge>
            default:
                return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Unknown</Badge>
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'confirmed':
                return <CheckCircle className="h-4 w-4 text-green-600" />
            case 'pending':
                return <Clock className="h-4 w-4 text-yellow-600" />
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-600" />
            default:
                return <AlertTriangle className="h-4 w-4 text-gray-600" />
        }
    }

    const openTransactionOnExplorer = (hash: string) => {
        if (hash) {
            // This would open the transaction on the appropriate blockchain explorer
            // For Sepolia: https://sepolia.etherscan.io/tx/{hash}
            const explorerUrl = `https://sepolia.etherscan.io/tx/${hash}`
            window.open(explorerUrl, '_blank')
        }
    }

    const getTransactionStats = () => {
        const total = filteredTransactions.length
        const confirmed = filteredTransactions.filter(tx => tx.status === 'confirmed').length
        const pending = filteredTransactions.filter(tx => tx.status === 'pending').length
        const failed = filteredTransactions.filter(tx => tx.status === 'failed').length
        
        return { total, confirmed, pending, failed }
    }

    const stats = getTransactionStats()

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Transaction History
                    </CardTitle>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search transactions..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 pr-4 py-2 border rounded-md text-sm w-48"
                            />
                        </div>
                        <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="deposit">Deposits</SelectItem>
                                <SelectItem value="withdraw">Withdrawals</SelectItem>
                                <SelectItem value="borrow">Borrows</SelectItem>
                                <SelectItem value="repay">Repayments</SelectItem>
                                <SelectItem value="lend">Lending</SelectItem>
                                <SelectItem value="interest">Interest</SelectItem>
                                <SelectItem value="liquidate">Liquidations</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={exportTransactions}
                            disabled={filteredTransactions.length === 0}
                        >
                            <Download className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadTransactionHistory}
                            disabled={isLoading}
                        >
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>
                
                {/* Transaction Stats */}
                <div className="flex gap-4 mt-4">
                    <div className="text-sm">
                        <span className="font-medium">Total:</span> {stats.total}
                    </div>
                    <div className="text-sm">
                        <span className="font-medium text-green-600">Confirmed:</span> {stats.confirmed}
                    </div>
                    <div className="text-sm">
                        <span className="font-medium text-yellow-600">Pending:</span> {stats.pending}
                    </div>
                    <div className="text-sm">
                        <span className="font-medium text-red-600">Failed:</span> {stats.failed}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {isLoading ? (
                    <div className="flex justify-center items-center py-8">
                        <RefreshCw className="h-6 w-6 animate-spin" />
                        <span className="ml-2">Loading transactions...</span>
                    </div>
                ) : filteredTransactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No transactions found</p>
                        <p className="text-sm">
                            {searchTerm ? 'Try adjusting your search terms' : 'Your transaction history will appear here'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredTransactions.map((tx) => (
                            <div
                                key={tx.id}
                                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        {getTransactionIcon(tx.type)}
                                        {getStatusIcon(tx.status)}
                                    </div>
                                    <div>
                                        <p className="font-medium">{tx.description}</p>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>{formatTransactionAmount(tx.amount, tx.token)}</span>
                                            {tx.collateralRatio && (
                                                <span>• Collateral: {tx.collateralRatio}</span>
                                            )}
                                            {tx.interestEarned && (
                                                <span>• Interest: {tx.interestEarned} ETH</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {formatTransactionTime(tx.timestamp)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {getStatusBadge(tx.status)}
                                    {tx.hash && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openTransactionOnExplorer(tx.hash!)}
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
} 