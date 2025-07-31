import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { AdminPanel } from "./admin/AdminPanel"
import { LiquidatorPanel } from "./liquidator/LiquidatorPanel"
import BorrowerPanel from "./borrower/BorrowerPanel"
import { LenderPanel } from "./lender/LenderPanel"
import { TransactionHistory } from "./shared/TransactionHistory"
import { UserPanel } from "./user/UserPanel"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Settings, Shield } from "lucide-react"
import { ethers } from "ethers"
import { GovernancePanel } from "./governance/GovernancePanel";

interface DashboardProps {
    contract: ethers.Contract;
    lendingManagerContract: ethers.Contract;
    account: string | null;
    isAdmin: boolean;
    isLiquidator: boolean;
    provider?: ethers.Provider;
    contracts?: any;
}

export function Dashboard({ contract, lendingManagerContract, account, isAdmin, isLiquidator, provider, contracts }: DashboardProps) {
    const [showAdminControls, setShowAdminControls] = useState(false)
    const [tlsnStatus, setTlsnStatus] = useState('')
    const [tlsnStatusType, setTlsnStatusType] = useState<'success' | 'error' | ''>('')

    const openTLSNExtension = () => {
        console.log('Attempting to open TLSN extension...');
        console.log('window.openTLSNExtension =', window.openTLSNExtension);
        console.log('window.tlsnExtensionAvailable =', window.tlsnExtensionAvailable);
        
        if (window.openTLSNExtension && window.tlsnExtensionAvailable) {
            try {
                const result = window.openTLSNExtension();
                console.log('openTLSNExtension returned:', result);
                
                setTlsnStatus('Opening TLSN Extension for credit verification...');
                setTlsnStatusType('success');
                
                // Clear success message after 3 seconds
                setTimeout(() => {
                    setTlsnStatus('');
                    setTlsnStatusType('');
                }, 3000);
            } catch (error) {
                console.error('Error calling TLSN extension:', error);
                setTlsnStatus('Error opening TLSN Extension. Please try again.');
                setTlsnStatusType('error');
            }
        } else {
            console.log('TLSN Extension not available');
            console.log('Available functions:', Object.keys(window).filter(key => key.includes('tlsn')));
            
            setTlsnStatus('TLSN Extension not found. Please install the extension first.');
            setTlsnStatusType('error');
        }
    };

    return (
        <div className="container mx-auto p-0">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <Button
                            variant="outline"
                            onClick={() => setShowAdminControls(!showAdminControls)}
                            className="flex items-center gap-2"
                        >
                            <Settings className="h-4 w-4" />
                            {showAdminControls ? "Hide Admin Controls" : "Show Admin Controls"}
                        </Button>
                    )}
                    
                    {/* TLSN Button */}
                    <Button
                        onClick={openTLSNExtension}
                        className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0"
                    >
                        <Shield className="h-4 w-4" />
                        TLSN Credit Score
                    </Button>
                </div>
            </div>

            {/* TLSN Status Message */}
            {tlsnStatus && (
                <div className={`mb-4 p-3 rounded-lg border ${
                    tlsnStatusType === 'error' 
                        ? 'bg-red-50 border-red-200 text-red-700' 
                        : 'bg-green-50 border-green-200 text-green-700'
                }`}>
                    {tlsnStatus}
                </div>
            )}

            {showAdminControls && isAdmin && (
                <div className="mb-6 p-6 border-2 border-primary/20 rounded-lg bg-muted/30 backdrop-blur-sm">
                    <AdminPanel contract={contract} lendingManagerContract={lendingManagerContract} account={account || ''} />
                </div>
            )}

            <Tabs defaultValue="user" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="user">User Dashboard</TabsTrigger>
                    <TabsTrigger value="lend">Lend</TabsTrigger>
                    <TabsTrigger value="borrow">Borrow</TabsTrigger>
                    <TabsTrigger value="transaction-history">Transaction History</TabsTrigger>
                    {isLiquidator && (
                        <TabsTrigger value="liquidator">Liquidator Panel</TabsTrigger>
                    )}
                    <TabsTrigger value="governance">Governance</TabsTrigger>
                </TabsList>

                <TabsContent value="user">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <UserPanel contract={contract} account={account || ''} />
                    </Card>
                </TabsContent>

                <TabsContent value="lend">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <LenderPanel contract={lendingManagerContract} liquidityPoolContract={contract} account={account || ''} contracts={contracts} />
                    </Card>
                </TabsContent>

                <TabsContent value="borrow">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <BorrowerPanel contract={contract} account={account || ''} />
                    </Card>
                </TabsContent>

                <TabsContent value="transaction-history">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <TransactionHistory
                            contract={contract}
                            lendingManagerContract={lendingManagerContract}
                            account={account || ''}
                            provider={provider}
                        />
                    </Card>
                </TabsContent>

                {isLiquidator && (
                    <TabsContent value="liquidator">
                        <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                            <LiquidatorPanel contract={contract} account={account || ''} />
                        </Card>
                    </TabsContent>
                )}

                <TabsContent value="governance">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <GovernancePanel account={account || ''} provider={provider} />
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}