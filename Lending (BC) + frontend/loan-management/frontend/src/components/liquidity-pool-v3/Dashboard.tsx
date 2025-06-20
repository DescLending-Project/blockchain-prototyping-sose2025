import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { AdminPanel } from "./admin/AdminPanel"
import { UserPanel } from "./user/UserPanel"
import { LiquidatorPanel } from "./liquidator/LiquidatorPanel"
// @ts-ignore
import { LenderPanel } from "./lender/LenderPanel.jsx"
import { TransactionHistory } from "./shared/TransactionHistory"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"
import { ethers } from "ethers"

interface DashboardProps {
    contract: any;
    account: string | null;
    isAdmin: boolean;
    isLiquidator: boolean;
    provider?: ethers.Provider;
}

export function Dashboard({ contract, account, isAdmin, isLiquidator, provider }: DashboardProps) {
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
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="user">User Dashboard</TabsTrigger>
                    <TabsTrigger value="lend">Lend & Provide</TabsTrigger>
                    <TabsTrigger value="history">Transaction History</TabsTrigger>
                    {isLiquidator && (
                        <TabsTrigger value="liquidator">Liquidator Panel</TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="user">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <UserPanel contract={contract} account={account} mode="user" />
                    </Card>
                </TabsContent>

                <TabsContent value="lend">
                    <Card className="p-6 bg-muted/30 backdrop-blur-sm">
                        <LenderPanel contract={contract} account={account} />
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <TransactionHistory contract={contract} account={account} provider={provider} />
                </TabsContent>

                {isLiquidator && (
                    <TabsContent value="liquidator">
                        <LiquidatorPanel contract={contract} account={account} />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    )
} 