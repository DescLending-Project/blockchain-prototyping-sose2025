import { ethers } from "ethers"

export interface Transaction {
    id: string
    type: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'lend' | 'liquidate' | 'interest'
    amount: string
    token?: string
    status: 'pending' | 'confirmed' | 'failed'
    timestamp: number
    hash?: string
    description: string
    collateralRatio?: string
    interestEarned?: string
    blockNumber?: number
}

export async function fetchTransactionHistory(
    contract: any,
    account: string,
    provider: ethers.Provider
): Promise<Transaction[]> {
    const transactions: Transaction[] = []
    
    try {
        console.log("Fetching transaction history for account:", account)
        
        // Get the current block number
        const currentBlock = await provider.getBlockNumber()
        console.log("Current block:", currentBlock)
        
        // Fetch events from the last 10000 blocks (increased range to catch more transactions)
        const fromBlock = Math.max(0, currentBlock - 10000)
        console.log("Querying from block:", fromBlock, "to block:", currentBlock)
        
        // Fetch different types of events from the main contract
        const events = await Promise.all([
            // Collateral events
            contract.queryFilter(contract.filters.CollateralDeposited(account), fromBlock, currentBlock).catch((err: any) => {
                console.log("Error querying CollateralDeposited events:", err)
                return []
            }),
            contract.queryFilter(contract.filters.CollateralWithdrawn(account), fromBlock, currentBlock).catch((err: any) => {
                console.log("Error querying CollateralWithdrawn events:", err)
                return []
            }),
            
            // Borrow/Repay events
            contract.queryFilter(contract.filters.Borrowed(account), fromBlock, currentBlock).catch((err: any) => {
                console.log("Error querying Borrowed events:", err)
                return []
            }),
            contract.queryFilter(contract.filters.Repaid(account), fromBlock, currentBlock).catch((err: any) => {
                console.log("Error querying Repaid events:", err)
                return []
            }),
            
            // Liquidation events
            contract.queryFilter(contract.filters.LiquidationStarted(account), fromBlock, currentBlock).catch((err: any) => {
                console.log("Error querying LiquidationStarted events:", err)
                return []
            }),
            contract.queryFilter(contract.filters.LiquidationExecuted(null, account), fromBlock, currentBlock).catch((err: any) => {
                console.log("Error querying LiquidationExecuted events:", err)
                return []
            }),
        ])
        
        console.log("Found events:", events.map((eventArray, index) => `${['CollateralDeposited', 'CollateralWithdrawn', 'Borrowed', 'Repaid', 'LiquidationStarted', 'LiquidationExecuted'][index]}: ${eventArray.length}`))
        
        // Process collateral deposit events
        for (const event of events[0]) {
            try {
                const block = await provider.getBlock(event.blockNumber)
                transactions.push({
                    id: `${event.transactionHash}-deposit`,
                    type: 'deposit',
                    amount: ethers.formatEther(event.args.amount),
                    token: event.args.token,
                    status: 'confirmed',
                    timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                    hash: event.transactionHash,
                    description: `Deposited ${ethers.formatEther(event.args.amount)} tokens as collateral`,
                    blockNumber: event.blockNumber
                })
            } catch (err) {
                console.error("Error processing deposit event:", err)
            }
        }
        
        // Process collateral withdrawal events
        for (const event of events[1]) {
            try {
                const block = await provider.getBlock(event.blockNumber)
                transactions.push({
                    id: `${event.transactionHash}-withdraw`,
                    type: 'withdraw',
                    amount: ethers.formatEther(event.args.amount),
                    token: event.args.token,
                    status: 'confirmed',
                    timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                    hash: event.transactionHash,
                    description: `Withdrew ${ethers.formatEther(event.args.amount)} tokens`,
                    blockNumber: event.blockNumber
                })
            } catch (err) {
                console.error("Error processing withdrawal event:", err)
            }
        }
        
        // Process borrow events
        for (const event of events[2]) {
            try {
                const block = await provider.getBlock(event.blockNumber)
                transactions.push({
                    id: `${event.transactionHash}-borrow`,
                    type: 'borrow',
                    amount: ethers.formatEther(event.args.amount),
                    status: 'confirmed',
                    timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                    hash: event.transactionHash,
                    description: `Borrowed ${ethers.formatEther(event.args.amount)} ETH`,
                    blockNumber: event.blockNumber
                })
            } catch (err) {
                console.error("Error processing borrow event:", err)
            }
        }
        
        // Process repay events
        for (const event of events[3]) {
            try {
                const block = await provider.getBlock(event.blockNumber)
                transactions.push({
                    id: `${event.transactionHash}-repay`,
                    type: 'repay',
                    amount: ethers.formatEther(event.args.amount),
                    status: 'confirmed',
                    timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                    hash: event.transactionHash,
                    description: `Repaid ${ethers.formatEther(event.args.amount)} ETH`,
                    blockNumber: event.blockNumber
                })
            } catch (err) {
                console.error("Error processing repay event:", err)
            }
        }
        
        // Process liquidation started events
        for (const event of events[4]) {
            try {
                const block = await provider.getBlock(event.blockNumber)
                transactions.push({
                    id: `${event.transactionHash}-liquidate-start`,
                    type: 'liquidate',
                    amount: '0',
                    status: 'confirmed',
                    timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                    hash: event.transactionHash,
                    description: `Liquidation started for position`,
                    blockNumber: event.blockNumber
                })
            } catch (err) {
                console.error("Error processing liquidation start event:", err)
            }
        }
        
        // Process liquidation executed events
        for (const event of events[5]) {
            try {
                const block = await provider.getBlock(event.blockNumber)
                transactions.push({
                    id: `${event.transactionHash}-liquidate-execute`,
                    type: 'liquidate',
                    amount: ethers.formatEther(event.args.amount),
                    status: 'confirmed',
                    timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                    hash: event.transactionHash,
                    description: `Position liquidated for ${ethers.formatEther(event.args.amount)} ETH`,
                    blockNumber: event.blockNumber
                })
            } catch (err) {
                console.error("Error processing liquidation execute event:", err)
            }
        }
        
        // Sort transactions by timestamp (newest first)
        transactions.sort((a, b) => b.timestamp - a.timestamp)
        
        console.log("Total transactions found:", transactions.length)
        
    } catch (error) {
        console.error("Error fetching transaction history:", error)
        throw error
    }
    
    return transactions
}

export function formatTransactionAmount(amount: string, token?: string): string {
    if (token) {
        return `${amount} ${token}`
    }
    return `${amount} ETH`
}

export function formatTransactionTime(timestamp: number): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - timestamp) / (1000 * 60 * 60))
    
    if (diffInHours < 1) {
        const diffInMinutes = Math.floor((now.getTime() - timestamp) / (1000 * 60))
        return `${diffInMinutes} minutes ago`
    } else if (diffInHours < 24) {
        return `${diffInHours} hours ago`
    } else {
        const diffInDays = Math.floor(diffInHours / 24)
        return `${diffInDays} days ago`
    }
} 