import { Contract } from 'ethers';

interface LenderPanelProps {
    contract: Contract;
    liquidityPoolContract: Contract;
    account: string;
}

export declare const LenderPanel: React.FC<LenderPanelProps>; 