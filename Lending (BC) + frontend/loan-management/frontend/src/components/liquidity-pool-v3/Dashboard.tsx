import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { AdminPanel } from "./admin/AdminPanel"
import { UserPanel } from "./user/UserPanel"
import { LiquidatorPanel } from "./liquidator/LiquidatorPanel"

export function Dashboard() {
    return (
        <div className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6">Liquidity Pool V3 Dashboard</h1>

            <Tabs defaultValue="user" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="user">User Dashboard</TabsTrigger>
                    <TabsTrigger value="admin">Admin Panel</TabsTrigger>
                    <TabsTrigger value="liquidator">Liquidator Panel</TabsTrigger>
                </TabsList>

                <TabsContent value="user">
                    <Card className="p-6">
                        <UserPanel />
                    </Card>
                </TabsContent>

                <TabsContent value="admin">
                    <Card className="p-6">
                        <AdminPanel />
                    </Card>
                </TabsContent>

                <TabsContent value="liquidator">
                    <Card className="p-6">
                        <LiquidatorPanel />
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
} 