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

const CONTRACT_ADDRESS = '0xA0B6F323FdA6dDB47Efeb90F5F68Ac1f91929787'

const COLLATERAL_TOKENS = [
  {
    address: '0xB2B051D52e816305BbB37ee83A2dB4aFaae0c55C',
    symbol: 'CORAL',
    name: 'Coral Token'
  },
  {
    address: '0xbA3E637a80A4D599284b3213A435a888d218D966',
    symbol: 'GLINT',
    name: 'Glint Token'
  }
]

export default function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLiquidator, setIsLiquidator] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

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
      setContract(contract)
      await checkRoles(contract, accounts[0])
      await checkPauseStatus(contract)

      // Store connection state in localStorage
      localStorage.setItem('walletConnected', 'true')
      localStorage.setItem('lastConnectedAccount', accounts[0])
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
      setIsPaused(false)
      setContract(null)

      // Clear connection state from localStorage
      localStorage.removeItem('walletConnected')
      localStorage.removeItem('lastConnectedAccount')
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
      const accounts = await provider.send("eth_requestAccounts", [])
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)

      setAccount(accounts[0])
      setContract(contract)
      await checkRoles(contract, accounts[0])
      await checkPauseStatus(contract)

      // Update last connected account in localStorage
      localStorage.setItem('lastConnectedAccount', accounts[0])
    } catch (err) {
      setError("Failed to switch account")
    } finally {
      setIsLoading(false)
    }
  }

  const checkRoles = async (contract, address) => {
    try {
      const addressStr = String(address).toLowerCase()
      const owner = await contract.owner()
      const ownerStr = String(owner).toLowerCase()
      setIsAdmin(ownerStr === addressStr)

      try {
        const isLiquidator = await contract.hasRole(await contract.LIQUIDATOR_ROLE(), address)
        setIsLiquidator(isLiquidator || ownerStr === addressStr)
      } catch (err) {
        setIsLiquidator(ownerStr === addressStr)
      }
    } catch (err) {
      console.error("Failed to check roles:", err)
      setIsAdmin(false)
      setIsLiquidator(false)
    }
  }

  const checkPauseStatus = async (contract) => {
    try {
      // Check if contract exists
      const provider = new ethers.BrowserProvider(window.ethereum)
      const code = await provider.getCode(contract.target)
      if (code === '0x') {
        console.error("Contract does not exist at the specified address")
        setIsPaused(false)
        return
      }

      const paused = await contract.paused()
      setIsPaused(paused)
    } catch (err) {
      console.error("Failed to check pause status:", err)
      setIsPaused(false)
    }
  }

  const togglePause = async () => {
    try {
      setIsLoading(true)
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)

      const tx = await contract.togglePause()
      await tx.wait()

      await checkPauseStatus(contract)
    } catch (err) {
      setError(err.message || "Failed to toggle pause status")
    } finally {
      setIsLoading(false)
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

          // Check if we have a stored connection state
          const wasConnected = localStorage.getItem('walletConnected') === 'true'
          const lastAccount = localStorage.getItem('lastConnectedAccount')

          if (accounts.length > 0 && wasConnected && lastAccount) {
            // Verify the account is still available
            const isAccountAvailable = accounts.some(acc =>
              acc && typeof acc === 'string' &&
              acc.toLowerCase() === lastAccount.toLowerCase()
            )

            if (isAccountAvailable) {
              const signer = await provider.getSigner()
              const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)
              setAccount(accounts[0])
              setContract(contract)
              await checkRoles(contract, accounts[0])
              await checkPauseStatus(contract)
            } else {
              // Account is no longer available, clear stored state
              localStorage.removeItem('walletConnected')
              localStorage.removeItem('lastConnectedAccount')
            }
          }
        } catch (err) {
          console.error("Failed to check connection:", err)
          // Clear stored connection state if there's an error
          localStorage.removeItem('walletConnected')
          localStorage.removeItem('lastConnectedAccount')
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

      // Add chainChanged event listener
      window.ethereum.on("chainChanged", () => {
        window.location.reload()
      })
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", () => { })
        window.ethereum.removeListener("chainChanged", () => { })
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
                <LogOut className="h-5 w-5" />
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
            contract={contract}
            account={account}
            isAdmin={isAdmin}
            isLiquidator={isLiquidator}
            onDisconnect={disconnectWallet}
            onSwitchAccount={switchAccount}
            adminControls={{
              isPaused,
              togglePause,
              isLoading
            }}
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