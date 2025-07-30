import { Contract } from 'ethers';

interface LenderPanelProps {
    contract: Contract;
    liquidityPoolContract: Contract;
    account: string;
    contracts?: any;
}

export declare const LenderPanel: React.FC<LenderPanelProps>; 