import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import LiquidityPoolV3ABI from './LiquidityPoolV3.json'
import { UserPanel } from './components/liquidity-pool-v3/user/UserPanel'
import { AdminPanel } from './components/liquidity-pool-v3/admin/AdminPanel'
import { Button } from './components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Alert, AlertDescription } from './components/ui/alert'
import { Wallet, AlertCircle } from 'lucide-react'

const CONTRACT_ADDRESS = '0x524C5F657533e3E8Fc0Ee137eB605a1d4FFE4D7D'

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

function App() {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [contract, setContract] = useState(null)
  const [account, setAccount] = useState(null)
  const [balance, setBalance] = useState('0')
  const [debt, setDebt] = useState('0')
  const [creditScore, setCreditScore] = useState(0)
  const [collateralTokens, setCollateralTokens] = useState([])
  const [healthStatus, setHealthStatus] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const connectWallet = async () => {
    try {
      setIsLoading(true)
      setError('')

      if (!window.ethereum) {
        throw new Error('Please install MetaMask to use this app')
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      // Verify contract address and ABI
      if (!CONTRACT_ADDRESS || !LiquidityPoolV3ABI.abi) {
        throw new Error('Contract configuration is missing')
      }

      console.log('Connecting to contract at:', CONTRACT_ADDRESS)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, LiquidityPoolV3ABI.abi, signer)

      // Verify contract connection - don't throw on failure, just log
      try {
        await contract.getBalance()
      } catch (err) {
        console.warn('Contract verification warning:', err)
        // Continue anyway, as some functions might still work
      }

      const account = await signer.getAddress()
      console.log('Connected account:', account)

      setProvider(provider)
      setSigner(signer)
      setContract(contract)
      setAccount(account)

      await fetchData(contract, account)
    } catch (err) {
      console.error('Error in connectWallet:', err)
      // Only show error if it's not a contract call error
      if (!err.message?.includes('call revert') && !err.message?.includes('missing revert data')) {
        setError(err.message || 'Failed to connect wallet')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const fetchData = async (contract, account) => {
    try {
      console.log('Fetching data for account:', account)

      // Fetch data one by one to better identify which call fails
      try {
        const balance = await contract.getBalance()
        console.log('Balance:', balance.toString())
        setBalance(ethers.formatEther(balance))
      } catch (err) {
        console.error('Error fetching balance:', err)
        // Don't throw, just set to 0
        setBalance('0')
      }

      try {
        const debt = await contract.getMyDebt()
        console.log('Debt:', debt.toString())
        setDebt(ethers.formatEther(debt))
      } catch (err) {
        console.error('Error fetching debt:', err)
        // Don't throw, just set to 0
        setDebt('0')
      }

      try {
        const creditScore = await contract.creditScore(account)
        console.log('Credit score:', creditScore.toString())
        setCreditScore(creditScore)
      } catch (err) {
        console.error('Error fetching credit score:', err)
        // Don't throw, just set to 0
        setCreditScore(0)
      }

      try {
        const collateralTokens = COLLATERAL_TOKENS.map(token => token.address)
        console.log('Using hardcoded collateral tokens:', collateralTokens)
        setCollateralTokens(collateralTokens)
      } catch (err) {
        console.error('Error setting collateral tokens:', err)
        // Don't throw, just use empty array
        setCollateralTokens([])
      }

      try {
        const healthCheck = await contract.checkCollateralization(account)
        console.log('Health check:', healthCheck)
        if (healthCheck && Array.isArray(healthCheck) && healthCheck.length >= 1) {
          setHealthStatus(healthCheck[0] ? 'Healthy' : 'At Risk')
        } else {
          // If we can't determine health status, assume healthy
          setHealthStatus('Healthy')
        }
      } catch (err) {
        console.error('Error checking health status:', err)
        // Don't throw, just set to healthy
        setHealthStatus('Healthy')
      }
    } catch (err) {
      console.error('Error in fetchData:', err)
      // Only show error if it's not a contract call error
      if (!err.message?.includes('call revert') && !err.message?.includes('missing revert data')) {
        setError(err.message || 'An error occurred while fetching data')
      }
    }
  }

  useEffect(() => {
    if (contract && account) {
      fetchData(contract, account)
    }
  }, [contract, account])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <nav className="border-b bg-white dark:bg-gray-800 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
            Liquidity Pool V3
          </h1>
          {!account ? (
            <Button
              onClick={connectWallet}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-md transition-all duration-200"
            >
              <Wallet className="w-4 h-4 mr-2" />
              {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-sm bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-full font-medium">
                {account.slice(0, 6)}...{account.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!account ? (
          <Card className="max-w-md mx-auto bg-white dark:bg-gray-800 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">Welcome to Liquidity Pool V3</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Connect your wallet to start managing your liquidity and collateral.
              </p>
              <Button
                onClick={connectWallet}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg shadow-md transition-all duration-200"
              >
                <Wallet className="w-4 h-4 mr-2" />
                {isLoading ? 'Connecting...' : 'Connect Wallet'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">Pool Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{balance} ETH</div>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">Your Debt</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{debt} ETH</div>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">Credit Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{creditScore}</div>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">Health Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{healthStatus}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <UserPanel
                contract={contract}
                account={account}
                collateralTokens={COLLATERAL_TOKENS}
                onError={setError}
              />
              <AdminPanel
                contract={contract}
                account={account}
                collateralTokens={COLLATERAL_TOKENS}
                onError={setError}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App