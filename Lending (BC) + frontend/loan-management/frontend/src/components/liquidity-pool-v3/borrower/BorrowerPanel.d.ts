import { Contract } from 'ethers';

interface BorrowerPanelProps {
    contract: Contract;
    account: string;
}

export declare const BorrowerPanel: React.FC<BorrowerPanelProps>; 