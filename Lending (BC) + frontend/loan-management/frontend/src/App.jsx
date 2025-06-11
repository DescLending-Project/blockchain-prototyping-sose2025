import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import LiquidityPoolV3ABI from './LiquidityPoolV3.json'
import { AdminPanel } from './components/liquidity-pool-v3/admin/AdminPanel'
import { LiquidatorPanel } from './components/liquidity-pool-v3/liquidator/LiquidatorPanel'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Alert, AlertDescription } from './components/ui/alert'
import { Wallet, AlertCircle, RefreshCw, LogOut } from 'lucide-react'
import { Dashboard } from './components/liquidity-pool-v3/Dashboard'
import BorrowerPanel from './components/liquidity-pool-v3/borrower/BorrowerPanel'
import { CollateralPanel } from './components/liquidity-pool-v3/user/CollateralPanel'

const CONTRACT_ADDRESS = '0xe05334647312926a1C5F75F1810Ac485b0018913'

const COLLATERAL_TOKENS = [
  {
    address: '0xecc6f14f4b64eedd56111d80f46ce46933dc2d64',
    symbol: 'CORAL',
    name: 'Coral Token'
  },
  {
    address: '0xC88ac012Cc1Bfa11Bfd5f73fd076555c7d230f6D',
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
  const [userError, setUserError] = useState("")

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

    // Add UserError event listener
    if (contract) {
      contract.on("UserError", (user, message) => {
        if (user.toLowerCase() === account?.toLowerCase()) {
          setUserError(message)
          // Clear the error after 5 seconds
          setTimeout(() => setUserError(""), 5000)
        }
      })
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", () => { })
        window.ethereum.removeListener("chainChanged", () => { })
      }
      // Remove UserError event listener
      if (contract) {
        contract.removeAllListeners("UserError")
      }
    }
  }, [contract, account])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Liquidity Pool V3</h1>
          {account ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Connected: {formatAddress(account)}
              </span>
              <Button
                variant="outline"
                onClick={disconnectWallet}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              onClick={connectWallet}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {userError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{userError}</AlertDescription>
          </Alert>
        )}

        {isPaused && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              The contract is currently paused. Some functions may be unavailable.
            </AlertDescription>
          </Alert>
        )}

        {account && contract && (
          <Dashboard
            contract={contract}
            account={account}
            isAdmin={isAdmin}
            isLiquidator={isLiquidator}
          />
        )}
      </div>
    </div>
  )
}