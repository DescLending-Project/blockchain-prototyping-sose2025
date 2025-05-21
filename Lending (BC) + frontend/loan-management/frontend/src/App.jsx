import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import LiquidityPoolV3ABI from './LiquidityPoolV3.json'
import { UserPanel } from './components/liquidity-pool-v3/user/UserPanel'
import { AdminPanel } from './components/liquidity-pool-v3/admin/AdminPanel'
import { LiquidatorPanel } from './components/liquidity-pool-v3/liquidator/LiquidatorPanel'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Alert, AlertDescription } from './components/ui/alert'
import { Wallet, AlertCircle, RefreshCw, LogOut } from 'lucide-react'
import { Dashboard } from './components/liquidity-pool-v3/Dashboard'

const CONTRACT_ADDRESS = '0xEb96D0f2a4DB02805dD032Ee5FA62da781f0CD75'

const COLLATERAL_TOKENS = [
  {
    address: '0x524C5F657533e3E8Fc0Ee137eB605a1d4FFE4D7D',
    symbol: 'CORAL',
    name: 'Coral Token'
  },
  {
    address: '0x1234567890123456789012345678901234567890',
    symbol: 'GLINT',
    name: 'Glint Token'
  }
]

export default function App() {
  const [account, setAccount] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLiquidator, setIsLiquidator] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const connectWallet = async () => {
    try {
      setIsLoading(true)
      setError("")

      if (!window.ethereum) {
        throw new Error("Please install MetaMask to use this application")
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await provider.send("eth_requestAccounts", [])
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)

      setAccount(accounts[0])
      await checkRoles(contract, accounts[0])
    } catch (err) {
      setError(err.message || "Failed to connect wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const disconnectWallet = async () => {
    try {
      setIsLoading(true)
      setError("")
      setAccount(null)
      setIsAdmin(false)
      setIsLiquidator(false)
    } catch (err) {
      setError("Failed to disconnect wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const switchAccount = async () => {
    try {
      setIsLoading(true)
      setError("")

      if (!window.ethereum) {
        throw new Error("Please install MetaMask to use this application")
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      // Request accounts again to prompt user to switch
      const accounts = await provider.send("eth_requestAccounts", [])
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)

      setAccount(accounts[0])
      await checkRoles(contract, accounts[0])
    } catch (err) {
      setError("Failed to switch account")
    } finally {
      setIsLoading(false)
    }
  }

  const checkRoles = async (contract, address) => {
    try {
      // Ensure address is a string
      const addressStr = String(address).toLowerCase()

      // Check if user is owner (admin)
      const owner = await contract.owner()
      const ownerStr = String(owner).toLowerCase()
      setIsAdmin(ownerStr === addressStr)

      // Check if user is liquidator by checking if they have liquidator role
      // or if they are the owner (since owner can also liquidate)
      try {
        const isLiquidator = await contract.hasRole(await contract.LIQUIDATOR_ROLE(), address)
        setIsLiquidator(isLiquidator || ownerStr === addressStr)
      } catch (err) {
        // If hasRole is not available, check if user is owner
        setIsLiquidator(ownerStr === addressStr)
      }
    } catch (err) {
      console.error("Failed to check roles:", err)
      // Set both to false in case of error
      setIsAdmin(false)
      setIsLiquidator(false)
    }
  }

  const formatAddress = (address) => {
    if (!address || typeof address !== 'string') return 'Not Connected'
    return `${address.slice(2, 6)}...${address.slice(-4)}`
  }

  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum)
          const accounts = await provider.listAccounts()
          if (accounts.length > 0) {
            const signer = await provider.getSigner()
            const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)
            setAccount(accounts[0])
            await checkRoles(contract, accounts[0])
          }
        } catch (err) {
          console.error("Failed to check connection:", err)
        }
      }
    }

    checkConnection()

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet()
        } else {
          switchAccount()
        }
      })
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", () => { })
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <header className="container mx-auto p-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Liquidity Pool V3 Dashboard</h1>
        <div>
          {!account ? (
            <Button
              onClick={connectWallet}
              className="h-12 px-8 text-lg"
              disabled={isLoading}
            >
              {isLoading ? "Connecting..." : "Connect Wallet"}
            </Button>
          ) : (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="lg"
                onClick={disconnectWallet}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Wallet className="h-5 w-5" />
                <span className="text-lg font-semibold text-foreground">
                  {formatAddress(account)}
                </span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto p-6 pt-0">
        {error && (
          <Alert variant="destructive" className="mb-6 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {account ? (
          <Dashboard
            contract={new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, new ethers.BrowserProvider(window.ethereum).getSigner())}
            account={account}
            isAdmin={isAdmin}
            isLiquidator={isLiquidator}
            onDisconnect={disconnectWallet}
            onSwitchAccount={switchAccount}
          />
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6">
            <p className="text-xl text-muted-foreground text-center max-w-2xl">
              Connect your wallet to start managing your liquidity, borrowing, and lending.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}