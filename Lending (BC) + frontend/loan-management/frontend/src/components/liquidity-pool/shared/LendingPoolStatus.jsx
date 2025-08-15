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
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (contract) {
            loadPoolInfo()
            checkNetwork()

            // Refresh pool info every 10 seconds
            const interval = setInterval(() => {
                loadPoolInfo().catch(err => {
                    console.error('Failed to refresh pool info:', err)
                })
            }, 10000)
            return () => clearInterval(interval)
        } else {
            setLoading(false)
        }
    }, [contract])

    const checkNetwork = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const network = await provider.getNetwork()
            const chainId = Number(network.chainId)

            // Set appropriate token symbol based on network
            if (chainId === 31337) {
                setTokenSymbol('ETH') // Localhost/Hardhat
            } else if (chainId === 57054) {
                setTokenSymbol('SONIC') // Sonic testnet
            } else if (chainId === 11155111) {
                setTokenSymbol('ETH') // Sepolia testnet
            } else {
                setTokenSymbol('ETH') // Default fallback
            }
        } catch (err) {
            console.error('Failed to check network:', err)
            setTokenSymbol('ETH') // Default fallback
        }
    }

    const loadPoolInfo = async () => {
        try {
            setLoading(true)
            setError(null)

            // Check if the function exists before calling it
            if (contract && contract.getBalance && typeof contract.getBalance === 'function') {
                const totalFunds = await contract.getBalance()
                setPoolInfo({
                    totalFunds: formatEther(totalFunds)
                })
            } else {
                // Fallback: try to get balance using provider
                console.log('getBalance function not available, using fallback')
                const contractAddress = await contract.getAddress()
                const balance = await contract.provider.getBalance(contractAddress)
                setPoolInfo({
                    totalFunds: formatEther(balance)
                })
            }
        } catch (err) {
            console.error('Failed to load pool info:', err)
            setError(err.message)
            // Set default values to prevent UI crash
            setPoolInfo({
                totalFunds: '0.0'
            })
        } finally {
            setLoading(false)
        }
    }

    if (!poolInfo) return null

    if (loading) {
        return (
            <Card className="mb-6">
                <CardContent className="p-4">
                    <p className="text-gray-600">Loading pool information...</p>
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card className="mb-6">
                <CardContent className="p-4">
                    <p className="text-red-600">Error loading pool data. Using fallback values.</p>
                </CardContent>
            </Card>
        )
    }

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
                            <p className="text-lg font-semibold">{poolInfo?.totalFunds || '0.0'} {tokenSymbol}</p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
} 