interface CollateralToken {
    address: string;
    symbol: string;
    name: string;
    isStablecoin: boolean;
    decimals?: number;
}

export const COLLATERAL_TOKENS: CollateralToken[]; 