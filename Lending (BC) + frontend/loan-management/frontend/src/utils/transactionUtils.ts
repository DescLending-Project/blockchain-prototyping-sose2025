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
        // Get the current block number
        const currentBlock = await provider.getBlockNumber()
        
        // Fetch events from the last 1000 blocks (adjust as needed)
        const fromBlock = Math.max(0, currentBlock - 1000)
        
        // Fetch different types of events
        const events = await Promise.all([
            // Collateral events
            contract.queryFilter(contract.filters.CollateralDeposited(account), fromBlock, currentBlock),
            contract.queryFilter(contract.filters.CollateralWithdrawn(account), fromBlock, currentBlock),
            
            // Borrow/Repay events
            contract.queryFilter(contract.filters.Borrowed(account), fromBlock, currentBlock),
            contract.queryFilter(contract.filters.Repaid(account), fromBlock, currentBlock),
            
            // Lending events
            contract.queryFilter(contract.filters.FundsDeposited(account), fromBlock, currentBlock),
            contract.queryFilter(contract.filters.InterestCredited(account), fromBlock, currentBlock),
            
            // Liquidation events
            contract.queryFilter(contract.filters.LiquidationStarted(account), fromBlock, currentBlock),
            contract.queryFilter(contract.filters.LiquidationExecuted(account), fromBlock, currentBlock),
        ])
        
        // Process collateral deposit events
        for (const event of events[0]) {
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
        }
        
        // Process collateral withdrawal events
        for (const event of events[1]) {
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
        }
        
        // Process borrow events
        for (const event of events[2]) {
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
        }
        
        // Process repay events
        for (const event of events[3]) {
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
        }
        
        // Process lending events
        for (const event of events[4]) {
            const block = await provider.getBlock(event.blockNumber)
            transactions.push({
                id: `${event.transactionHash}-lend`,
                type: 'lend',
                amount: ethers.formatEther(event.args.amount),
                status: 'confirmed',
                timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                hash: event.transactionHash,
                description: `Lent ${ethers.formatEther(event.args.amount)} ETH to the pool`,
                blockNumber: event.blockNumber
            })
        }
        
        // Process interest events
        for (const event of events[5]) {
            const block = await provider.getBlock(event.blockNumber)
            transactions.push({
                id: `${event.transactionHash}-interest`,
                type: 'interest',
                amount: ethers.formatEther(event.args.interest),
                status: 'confirmed',
                timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now(),
                hash: event.transactionHash,
                description: `Earned ${ethers.formatEther(event.args.interest)} ETH in interest`,
                interestEarned: ethers.formatEther(event.args.interest),
                blockNumber: event.blockNumber
            })
        }
        
        // Process liquidation events
        for (const event of events[6]) {
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
        }
        
        for (const event of events[7]) {
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
        }
        
        // Sort transactions by timestamp (newest first)
        transactions.sort((a, b) => b.timestamp - a.timestamp)
        
    } catch (error) {
        console.error("Error fetching transaction history:", error)
        throw error
    }
    
    return transactions
}

export async function getTransactionStatus(
    hash: string,
    provider: ethers.Provider
): Promise<'pending' | 'confirmed' | 'failed'> {
    try {
        const receipt = await provider.getTransactionReceipt(hash)
        if (!receipt) {
            return 'pending'
        }
        return receipt.status === 1 ? 'confirmed' : 'failed'
    } catch (error) {
        console.error("Error getting transaction status:", error)
        return 'pending'
    }
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