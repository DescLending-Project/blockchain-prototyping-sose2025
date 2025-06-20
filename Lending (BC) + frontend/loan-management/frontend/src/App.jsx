import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import LiquidityPoolV3ABI from './LiquidityPoolV3.json'
import { UserPanel } from './components/liquidity-pool-v3/user/UserPanel'
import { AdminPanel } from './components/liquidity-pool-v3/admin/AdminPanel'
import { LiquidatorPanel } from './components/liquidity-pool-v3/liquidator/LiquidatorPanel'
import { LenderPanel } from './components/liquidity-pool-v3/lender/LenderPanel'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Alert, AlertDescription } from './components/ui/alert'
import { Wallet, AlertCircle, RefreshCw, LogOut } from 'lucide-react'
import { Dashboard } from './components/liquidity-pool-v3/Dashboard'
import contractJson from "./LiquidityPoolV3.json";
const ABI = contractJson.abi;

const CONTRACT_ADDRESS = '0x3B6006C45E2bc05daaa1e088DA81cE5f0D02e908'

const COLLATERAL_TOKENS = [
  {
    address: '0xAF93888cbD250300470A1618206e036E11470149',
    symbol: 'CORAL',
    name: 'Coral Token'
  },
  {
    address: '0x545d52814b0A6B8cF4a89D5E7b0330a83e71AdE4',
    symbol: 'GLINT',
    name: 'Glint Token'
  }
]

export default function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [provider, setProvider] = useState(null)
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

      const newProvider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await newProvider.send("eth_requestAccounts", [])
      const signer = await newProvider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)

      setAccount(accounts[0])
      setContract(contract)
      setProvider(newProvider)
      await checkRoles(contract, accounts[0])
      await checkPauseStatus(contract)

      // Debug information
      const owner = await contract.owner()
      console.log('Contract Owner:', owner)
      console.log('Current User Address:', accounts[0])
      console.log('Is Owner:', owner.toLowerCase() === accounts[0].toLowerCase())

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
      setProvider(null)

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

      const newProvider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await newProvider.send("eth_requestAccounts", [])
      const signer = await newProvider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)

      setAccount(accounts[0])
      setContract(contract)
      setProvider(newProvider)
      await checkRoles(contract, accounts[0])
      await checkPauseStatus(contract)

      // Debug information
      const owner = await contract.owner()
      console.log('Contract Owner:', owner)
      console.log('Current User Address:', accounts[0])
      console.log('Is Owner:', owner.toLowerCase() === accounts[0].toLowerCase())

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
              setProvider(provider)
              await checkRoles(contract, accounts[0])
              await checkPauseStatus(contract)

              // Debug information
              const owner = await contract.owner()
              console.log('Contract Owner:', owner)
              console.log('Current User Address:', accounts[0])
              console.log('Is Owner:', owner.toLowerCase() === accounts[0].toLowerCase())
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
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Liquidity Pool V3</h1>
          {!account ? (
            <Button onClick={connectWallet} disabled={isLoading}>
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
          ) : (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {formatAddress(account)}
              </span>
              <Button variant="outline" onClick={switchAccount} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Switch Account
              </Button>
              <Button variant="outline" onClick={disconnectWallet} disabled={isLoading}>
                <LogOut className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {userError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{userError}</AlertDescription>
          </Alert>
        )}

        {isPaused && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>The contract is currently paused</AlertDescription>
          </Alert>
        )}

        {account && (
          <div className="space-y-8">
            <Dashboard 
              contract={contract} 
              account={account} 
              isAdmin={isAdmin}
              isLiquidator={isLiquidator}
              provider={provider}
            />
            <LenderPanel contract={contract} account={account} />
            {isAdmin && <AdminPanel contract={contract} account={account} />}
            {isLiquidator && <LiquidatorPanel contract={contract} account={account} />}
          </div>
        )}
      </div>
    </div>
  )
}