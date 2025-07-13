import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import LiquidityPool from '../../../LiquidityPool.json'
import { UserPosition, TokenInfo } from './types'

declare global {
    interface Window {
        ethereum: any
    }
}

export function useLiquidityPool(contractAddress: string) {
    const [position, setPosition] = useState<UserPosition>({
        totalCollateralValue: '0',
        minCollateralRatio: '0',
        isLiquidatable: false
    })

    const checkHealth = useCallback(async (userAddress: string) => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const contract = new ethers.Contract(
                contractAddress,
                LiquidityPool.abi,
                provider
            )

            const isLiquidatable = await contract.checkCollateralization(userAddress)
            setPosition(prev => ({ ...prev, isLiquidatable }))

            return isLiquidatable
        } catch (error) {
            console.error('Error checking health:', error)
            return false
        }
    }, [contractAddress])

    const getPosition = useCallback(async (userAddress: string) => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const contract = new ethers.Contract(
                contractAddress,
                LiquidityPool.abi,
                provider
            )

            const [totalValue, minRatio] = await Promise.all([
                contract.getTotalCollateralValue(userAddress),
                contract.getMinCollateralRatio(userAddress)
            ])

            setPosition({
                totalCollateralValue: ethers.formatEther(totalValue),
                minCollateralRatio: ethers.formatEther(minRatio),
                isLiquidatable: false
            })
        } catch (error) {
            console.error('Error getting position:', error)
        }
    }, [contractAddress])

    return {
        position,
        checkHealth,
        getPosition
    }
}

export function useTokenInfo(contractAddress: string) {
    const [allowedTokens, setAllowedTokens] = useState<TokenInfo[]>([])

    const fetchAllowedTokens = useCallback(async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const contract = new ethers.Contract(
                contractAddress,
                LiquidityPool.abi,
                provider
            )

            const tokens = await contract.getAllowedCollateralTokens()
            setAllowedTokens(tokens)
        } catch (error) {
            console.error('Error fetching allowed tokens:', error)
        }
    }, [contractAddress])

    return {
        allowedTokens,
        fetchAllowedTokens
    }
} 