import { useEffect, useState } from "react"
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
    lendingManagerContract: any
    account: string
    provider: any
}

export function TransactionHistory({ contract, lendingManagerContract, account, provider }: TransactionHistoryProps) {
    const [transactions, setTransactions] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
    const [filter, setFilter] = useState<string>('all')
    const [searchTerm, setSearchTerm] = useState<string>('')
    const [error, setError] = useState("")

    console.log("TransactionHistory component mounted with props:", {
        hasContract: !!contract,
        hasLendingManagerContract: !!lendingManagerContract,
        account,
        hasProvider: !!provider
    })

    useEffect(() => {
        console.log("TransactionHistory useEffect triggered")
        if (!provider || !account || !contract || !lendingManagerContract) {
            console.log("Missing required props:", {
                hasProvider: !!provider,
                hasAccount: !!account,
                hasContract: !!contract,
                hasLendingManagerContract: !!lendingManagerContract
            })
            return
        }

        async function fetchTransactions() {
            setLoading(true)
            let allEvents: any[] = []

            console.log("Fetching transactions for account:", account)
            console.log("Contract addresses:", {
                pool: contract.target,
                lendingManager: lendingManagerContract.target
            })

            // Helper to fetch events from a contract
            async function fetchEvents(contractInstance: any, contractName: string, eventNames: string[]) {
                for (const eventName of eventNames) {
                    try {
                        const filter = contractInstance.filters[eventName]()
                        const logs = await contractInstance.queryFilter(filter, 0, "latest")
                        console.log(`Found ${logs.length} ${eventName} events for ${contractName}`)

                        for (const log of logs) {
                            // Check if the user is involved in this event
                            let userInvolved = false
                            if (log.args) {
                                // Check all indexed and non-indexed parameters for the user's address
                                Object.values(log.args).forEach(value => {
                                    if (typeof value === 'string' &&
                                        value.toLowerCase() === account.toLowerCase()) {
                                        userInvolved = true
                                    }
                                })
                            }

                            if (userInvolved) {
                                console.log(`User involved in ${eventName}:`, log.args)
                                // Get block timestamp
                                const block = await provider.getBlock(log.blockNumber)
                                allEvents.push({
                                    contract: contractName,
                                    event: eventName,
                                    args: log.args,
                                    txHash: log.transactionHash,
                                    timestamp: block.timestamp,
                                    blockNumber: log.blockNumber,
                                })
                            }
                        }
                    } catch (e) {
                        console.log(`Error fetching ${eventName} events:`, e)
                        // Ignore missing events
                    }
                }
            }

            // Pool events
            await fetchEvents(contract, "LiquidityPool", [
                "CollateralDeposited",
                "CollateralWithdrawn",
                "Borrowed",
                "Repaid",
                "LiquidationStarted",
                "LiquidationExecuted",
                "CreditScoreAssigned",
                "Extracted",
                "EmergencyPaused"
            ])

            // LendingManager events
            await fetchEvents(lendingManagerContract, "LendingManager", [
                "FundsDeposited",
                "FundsWithdrawn",
                "InterestClaimed",
                "InterestCredited",
                "WithdrawalRequested",
                "WithdrawalCancelled",
                "EarlyWithdrawalPenalty"
            ])

            // Sort by timestamp descending
            allEvents.sort((a, b) => b.timestamp - a.timestamp)

            console.log("Total events found:", allEvents.length)
            console.log("All events:", allEvents)

            setTransactions(allEvents)
            setLoading(false)
        }

        fetchTransactions()
    }, [provider, account, contract, lendingManagerContract])

    useEffect(() => {
        filterTransactions()
    }, [transactions, filter, searchTerm])

    const filterTransactions = () => {
        let filtered = transactions

        // Filter by type
        if (filter !== 'all') {
            filtered = filtered.filter(tx => tx.event === filter)
        }

        // Filter by search term
        if (searchTerm) {
            filtered = filtered.filter(tx =>
                tx.contract.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (tx.args.amount && tx.args.amount.toString().includes(searchTerm)) ||
                (tx.args.value && tx.args.value.toString().includes(searchTerm))
            )
        }

        setFilteredTransactions(filtered.map(tx => ({
            ...tx,
            type: tx.event,
            amount: tx.args.amount ? ethers.formatEther(tx.args.amount) : tx.args.value ? ethers.formatEther(tx.args.value) : '',
            token: tx.args.token,
            status: 'confirmed',
            description: formatAction(tx.event, tx.contract),
            timestamp: tx.timestamp,
            hash: tx.txHash,
            collateralRatio: tx.args.collateralRatio,
            interestEarned: tx.args.interestEarned,
            id: tx.txHash
        })))
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

    function formatAction(event: string, contract: string) {
        const map: Record<string, string> = {
            CollateralDeposited: "Deposit Collateral",
            CollateralWithdrawn: "Withdraw Collateral",
            Borrowed: "Borrow",
            Repaid: "Repay",
            LiquidationStarted: "Liquidation Started",
            LiquidationExecuted: "Liquidation Executed",
            CreditScoreAssigned: "Credit Score Assigned",
            Extracted: "Funds Extracted",
            EmergencyPaused: "Emergency Pause",
            FundsDeposited: "Deposit Funds",
            FundsWithdrawn: "Withdraw Funds",
            InterestClaimed: "Claim Interest",
            InterestCredited: "Interest Credited",
            WithdrawalRequested: "Withdrawal Requested",
            WithdrawalCancelled: "Withdrawal Cancelled",
            EarlyWithdrawalPenalty: "Early Withdrawal Penalty"
        }
        return `${map[event] || event} (${contract})`
    }

    function formatTimestamp(ts: number) {
        return new Date(ts * 1000).toLocaleString()
    }

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
                                <SelectItem value="CollateralDeposited">Deposits</SelectItem>
                                <SelectItem value="CollateralWithdrawn">Withdrawals</SelectItem>
                                <SelectItem value="Borrowed">Borrows</SelectItem>
                                <SelectItem value="Repaid">Repayments</SelectItem>
                                <SelectItem value="FundsDeposited">Lending</SelectItem>
                                <SelectItem value="InterestClaimed">Interest</SelectItem>
                                <SelectItem value="LiquidationStarted">Liquidations</SelectItem>
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

                {loading ? (
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
                                            {formatTimestamp(tx.timestamp)}
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