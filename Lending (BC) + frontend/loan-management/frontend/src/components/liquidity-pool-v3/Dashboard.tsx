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
import { Settings } from "lucide-react"
import { Contract, Provider } from "ethers"

interface DashboardProps {
    contract: Contract;
    lendingManagerContract: Contract;
    account: string | null;
    isAdmin: boolean;
    isLiquidator: boolean;
    provider?: Provider;
}

export function Dashboard({ contract, lendingManagerContract, account, isAdmin, isLiquidator, provider }: DashboardProps) {
    const [showAdminControls, setShowAdminControls] = useState(false)

    return (
        <div className="container mx-auto p-0">
            <div className="flex justify-between items-center mb-6">
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
            </div>

            {showAdminControls && isAdmin && (
                <div className="mb-6 p-6 border-2 border-primary/20 rounded-lg bg-muted/30 backdrop-blur-sm">
                    <AdminPanel contract={contract} account={account} />
                </div>
            )}

            <Tabs defaultValue="user" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="user">User Dashboard</TabsTrigger>
                    <TabsTrigger value="lend">Lend</TabsTrigger>
                    <TabsTrigger value="borrow">Borrow</TabsTrigger>
                    <TabsTrigger value="transaction-history">Transaction History</TabsTrigger>
                    {isLiquidator && (
                        <TabsTrigger value="liquidator">Liquidator Panel</TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="user">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <UserPanel contract={contract} account={account || ''} />
                    </Card>
                </TabsContent>

                <TabsContent value="lend">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <LenderPanel contract={lendingManagerContract} liquidityPoolContract={contract} account={account || ''} />
                    </Card>
                </TabsContent>

                <TabsContent value="borrow">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <BorrowerPanel contract={contract} account={account || ''} />
                    </Card>
                </TabsContent>

                <TabsContent value="transaction-history">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <TransactionHistory contract={contract} account={account || ''} provider={provider} />
                    </Card>
                </TabsContent>

                {isLiquidator && (
                    <TabsContent value="liquidator">
                        <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                            <LiquidatorPanel contract={contract} account={account || ''} />
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
} 