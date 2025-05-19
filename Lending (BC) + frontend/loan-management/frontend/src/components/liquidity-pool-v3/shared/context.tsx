import React, { createContext, useContext, ReactNode } from 'react'
import { useLiquidityPool } from './hooks'
import { useTokenInfo } from './hooks'

interface LiquidityPoolContextType {
    position: {
        totalCollateralValue: string
        minCollateralRatio: string
        isLiquidatable: boolean
    }
    allowedTokens: Array<{
        address: string
        symbol: string
        decimals: number
    }>
    checkHealth: (userAddress: string) => Promise<boolean>
    getPosition: (userAddress: string) => Promise<void>
    fetchAllowedTokens: () => Promise<void>
}

const LiquidityPoolContext = createContext<LiquidityPoolContextType | null>(null)

export function LiquidityPoolProvider({
    children,
    contractAddress
}: {
    children: ReactNode
    contractAddress: string
}) {
    const { position, checkHealth, getPosition } = useLiquidityPool(contractAddress)
    const { allowedTokens, fetchAllowedTokens } = useTokenInfo(contractAddress)

    return (
        <LiquidityPoolContext.Provider
            value={{
                position,
                allowedTokens,
                checkHealth,
                getPosition,
                fetchAllowedTokens
            }}
        >
            {children}
        </LiquidityPoolContext.Provider>
    )
}

export function useLiquidityPoolContext() {
    const context = useContext(LiquidityPoolContext)
    if (!context) {
        throw new Error('useLiquidityPoolContext must be used within a LiquidityPoolProvider')
    }
    return context
} 