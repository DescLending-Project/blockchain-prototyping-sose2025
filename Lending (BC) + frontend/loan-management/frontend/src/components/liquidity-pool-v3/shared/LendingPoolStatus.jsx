import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Card, CardContent } from '../../ui/card'
import { formatEther } from 'ethers'
import { Info } from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../../ui/tooltip"

export function LendingPoolStatus({ contract }) {
    const [poolInfo, setPoolInfo] = useState(null)
    const [tokenSymbol, setTokenSymbol] = useState('ETH')

    useEffect(() => {
        if (contract) {
            loadPoolInfo()
            checkNetwork()

            // Refresh pool info every 10 seconds
            const interval = setInterval(loadPoolInfo, 10000)
            return () => clearInterval(interval)
        }
    }, [contract])

    const checkNetwork = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const network = await provider.getNetwork()
            // Set SONIC for all networks since we're using SONIC
            setTokenSymbol('SONIC')
        } catch (err) {
            console.error('Failed to check network:', err)
            setTokenSymbol('SONIC')
        }
    }

    const loadPoolInfo = async () => {
        try {
            const totalFunds = await contract.getBalance()
            setPoolInfo({
                totalFunds: formatEther(totalFunds)
            })
        } catch (err) {
            console.error('Failed to load pool info:', err)
        }
    }

    if (!poolInfo) return null

    return (
        <Card className="mb-6">
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">Lending Pool Status</h3>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Info className="h-4 w-4 text-gray-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Total funds available in the lending pool</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Total Pool</p>
                            <p className="text-lg font-semibold">{poolInfo.totalFunds} {tokenSymbol}</p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
} 