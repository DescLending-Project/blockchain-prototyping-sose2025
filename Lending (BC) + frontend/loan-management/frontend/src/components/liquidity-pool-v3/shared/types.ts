export interface TokenInfo {
    address: string
    symbol: string
    decimals: number
}

export interface UserPosition {
    totalCollateralValue: string
    minCollateralRatio: string
    isLiquidatable: boolean
}

export interface LiquidationInfo {
    targetUser: string
    canStartLiquidation: boolean
    canExecuteLiquidation: boolean
} 