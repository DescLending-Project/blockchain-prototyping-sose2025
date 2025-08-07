import { Contract } from 'ethers';

interface BorrowerPanelProps {
    contract: Contract;
    account: string;
    contracts?: any;
}

declare const BorrowerPanel: React.FC<BorrowerPanelProps>;
export default BorrowerPanel; 