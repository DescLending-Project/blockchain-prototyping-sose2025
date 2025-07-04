import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs'
import { Card } from './components/ui/card'
import { Alert, AlertDescription } from './components/ui/alert'
import { Button } from './components/ui/button'
import { Wallet, AlertCircle, RefreshCw, LogOut } from 'lucide-react'
import LiquidityPoolV3ABI from './LiquidityPoolV3.json'
import LendingManagerABI from './LendingManager.json'
import { LenderPanel } from './components/liquidity-pool-v3/lender/LenderPanel'
import BorrowerPanel from './components/liquidity-pool-v3/borrower/BorrowerPanel'
import { LiquidatorPanel } from './components/liquidity-pool-v3/liquidator/LiquidatorPanel'
import { AdminPanel } from './components/liquidity-pool-v3/admin/AdminPanel'
import { Dashboard } from './components/liquidity-pool-v3/Dashboard'
import { CollateralPanel } from './components/liquidity-pool-v3/user/CollateralPanel'
import { DEFAULT_NETWORK } from './config/networks'

// Contract addresses
const POOL_ADDRESS = '0x4887575b7DF71ae2945932C7267b44005F108528';
const LENDING_MANAGER_ADDRESS = '0x3C4a040890Db880dd9b7b4DE40706A91999ee20B';

// Network-specific token addresses
const NETWORK_TOKENS = {
  sepolia: {
    USDC: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    USDT: '0x7169d38820dfd117c3fa1f22a697dba58d90ba06',
  },
  sonic: {
    USDC: '0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6',
    USDT: '0x6047828dc181963ba44974801ff68e538da5eaf9',
  }
};

const CONTRACT_ADDRESSES = {
  sepolia: {
    pool: POOL_ADDRESS,
    lending: LENDING_MANAGER_ADDRESS
  },
  sonic: {
    pool: POOL_ADDRESS,
    lending: LENDING_MANAGER_ADDRESS
  }
};

// Collateral tokens array - will be updated based on network
const COLLATERAL_TOKENS = [
  {
    address: '0x8c4C32128eB6e0eE842d596695525Efd4E7845a7', // GLINT
    symbol: 'GLINT',
    name: 'Glint Token',
    isStablecoin: false
  },
  {
    address: '0xecc6f14f4b64eedd56111d80f46ce46933dc2d64', // CORAL
    symbol: 'CORAL',
    name: 'Coral Token',
    isStablecoin: false
  },
  {
    address: '0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6', // USDC - will be set based on network
    symbol: 'USDC',
    name: 'USD Coin',
    isStablecoin: true,
    decimals: 6
  },
  {
    address: '0x6047828dc181963ba44974801ff68e538da5eaf9', // USDT - will be set based on network
    symbol: 'USDT',
    name: 'Tether USD',
    isStablecoin: true,
    decimals: 6
  }
];

const CHAIN_ID_TO_NETWORK = {
  11155111: 'sepolia',
  57054: 'sonic'
};

// Update token addresses based on network
const updateTokenAddresses = (networkName) => {
  const networkTokens = NETWORK_TOKENS[networkName] || NETWORK_TOKENS.sepolia;
  COLLATERAL_TOKENS[2].address = networkTokens.USDC;
  COLLATERAL_TOKENS[3].address = networkTokens.USDT;
};

export { COLLATERAL_TOKENS, updateTokenAddresses };

export default function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [lendingManagerContract, setLendingManagerContract] = useState(null)
  const [provider, setProvider] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLiquidator, setIsLiquidator] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [userError, setUserError] = useState("")
  const [networkName, setNetworkName] = useState('sepolia')
  const SUPPORTED_CHAINS = [11155111, 57054]; // Sepolia and Sonic

  const initializeContracts = async (provider, signer, networkName) => {
    try {
      console.log('Initializing contracts for network:', networkName);

      // Get addresses for current network, fallback to sonic if not found
      const addresses = CONTRACT_ADDRESSES[networkName] || CONTRACT_ADDRESSES.sonic;
      if (!addresses) {
        throw new Error(`No contract addresses configured for ${networkName}`);
      }

      console.log('Using contract addresses:', addresses);

      // Initialize contracts with ABI from imported JSON
      const liquidityPoolContract = new ethers.Contract(
        addresses.pool,
        LiquidityPoolV3ABI.abi,
        signer
      );

      const lendingContract = new ethers.Contract(
        addresses.lending,
        LendingManagerABI.abi,
        signer
      );

      // Verify contracts are deployed
      const [poolCode, lendingCode] = await Promise.all([
        provider.getCode(addresses.pool),
        provider.getCode(addresses.lending)
      ]);

      if (poolCode === '0x') {
        throw new Error(`LiquidityPool contract not deployed at ${addresses.pool}`);
      }
      if (lendingCode === '0x') {
        throw new Error(`LendingManager contract not deployed at ${addresses.lending}`);
      }

      console.log('Contracts initialized successfully');
      setContract(liquidityPoolContract);
      setLendingManagerContract(lendingContract);
      setNetworkName(networkName);

      return {
        liquidityPoolContract,
        lendingContract
      };
    } catch (err) {
      console.error('Failed to initialize contracts:', err);
      setError(`Failed to initialize contracts: ${err.message}`);
      return null;
    }
  }

  const connectWallet = async () => {
    try {
      setIsLoading(true);
      setError("");

      if (!window.ethereum) {
        throw new Error("Please install MetaMask to use this application");
      }

      // 1. First check the network
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      const chainIdNum = parseInt(chainId, 16);

      if (!SUPPORTED_CHAINS.includes(chainIdNum)) {
        const supportedNetworks = SUPPORTED_CHAINS.map(id => CHAIN_ID_TO_NETWORK[id]).join(' or ');
        throw new Error(`Unsupported network. Please switch to ${supportedNetworks}`);
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      // 2. Get network name for contract initialization
      const network = await provider.getNetwork();
      const networkName = CHAIN_ID_TO_NETWORK[Number(network.chainId)] || 'sepolia';

      // 3. Initialize contracts with network context
      const contracts = await initializeContracts(provider, signer, networkName);
      if (!contracts) {
        throw new Error("Failed to initialize contracts");
      }

      setAccount(accounts[0]);

      // 4. Check roles and pause status
      await checkRoles(contracts.liquidityPoolContract, accounts[0]);
      await checkPauseStatus(contracts.liquidityPoolContract);

      // 5. Update token addresses based on network
      updateTokenAddresses(networkName);

      // 6. Improved network change handler
      const handleNetworkChange = async (chainIdHex) => {
        const newChainId = parseInt(chainIdHex, 16);

        if (!SUPPORTED_CHAINS.includes(newChainId)) {
          setError(`Unsupported network. Please switch to Sepolia or Sonic`);
          return;
        }

        try {
          const newProvider = new ethers.BrowserProvider(window.ethereum);
          const newSigner = await newProvider.getSigner();
          const newNetworkName = CHAIN_ID_TO_NETWORK[newChainId] || 'sepolia';

          await initializeContracts(newProvider, newSigner, newNetworkName);
          updateTokenAddresses(newNetworkName);
          setError("");
        } catch (err) {
          console.error("Network change failed:", err);
          setError("Failed to handle network change");
        }
      };

      // 7. Add and clean up event listener properly
      window.ethereum.on('chainChanged', handleNetworkChange);

      // 8. Store connection state
      localStorage.setItem('walletConnected', 'true');
      localStorage.setItem('lastConnectedAccount', accounts[0]);
      localStorage.setItem('lastNetwork', networkName);

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to connect wallet");

      // Clear loading state on error
      setIsLoading(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      setIsLoading(true)
      setError("")
      setAccount(null)
      setIsAdmin(false)
      setIsLiquidator(false)
      setIsPaused(false)
      setContract(null)
      setLendingManagerContract(null)
      setProvider(null)

      // Clear connection state from localStorage
      localStorage.removeItem('walletConnected')
      localStorage.removeItem('lastConnectedAccount')
      localStorage.removeItem('lastNetwork')
    } catch (err) {
      setError("Failed to disconnect wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const switchAccount = async () => {
    try {
      setIsLoading(true);
      setError("");

      if (!window.ethereum) {
        throw new Error("Please install MetaMask to use this application");
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      // Determine network name
      const chainId = Number(network.chainId);
      const networkName = CHAIN_ID_TO_NETWORK[chainId] || 'sonic';

      // Initialize contracts with network name
      const contracts = await initializeContracts(provider, signer, networkName);

      if (!contracts) {
        throw new Error("Failed to initialize contracts");
      }

      setAccount(accounts[0]);
      setContract(contracts.liquidityPoolContract);
      setLendingManagerContract(contracts.lendingContract);
      setNetworkName(networkName);

      await checkRoles(contracts.liquidityPoolContract, accounts[0]);
      await checkPauseStatus(contracts.liquidityPoolContract);

      // Update last connected account in localStorage
      localStorage.setItem('lastConnectedAccount', accounts[0]);
      localStorage.setItem('lastNetwork', networkName);
    } catch (err) {
      setError(err.message || "Failed to switch account");
    } finally {
      setIsLoading(false);
    }
  };

  const safeFormatEther = (value) => {
    try {
      return ethers.formatEther(value);
    } catch (e) {
      console.error('Error formatting value:', value, e);
      return '0';
    }
  };

  const safeContractCall = async (contract, method, ...args) => {
    try {
      return await contract[method](...args);
    } catch (err) {
      console.error(`Contract call error (${method}):`, err);
      return null;
    }
  };

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
      const contract = new ethers.Contract(POOL_ADDRESS, LiquidityPoolV3ABI.abi, signer)

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
          const network = await provider.getNetwork()
          const detectedNetwork = CHAIN_ID_TO_NETWORK[Number(network.chainId)] || DEFAULT_NETWORK
          setNetworkName(detectedNetwork)
          updateTokenAddresses(detectedNetwork); // Update token addresses based on network
          const addresses = CONTRACT_ADDRESSES[detectedNetwork] || CONTRACT_ADDRESSES[DEFAULT_NETWORK]
          console.log('Detected network:', detectedNetwork, 'Selected addresses:', addresses)

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
              // Create LiquidityPoolV3 contract instance
              const contract = new ethers.Contract(addresses.pool, LiquidityPoolV3ABI.abi, signer)
              // Create LendingManager contract instance
              const lendingManagerContract = new ethers.Contract(addresses.lending, LendingManagerABI.abi, signer)

              setAccount(accounts[0])
              setContract(contract)
              setLendingManagerContract(lendingManagerContract)
              setProvider(provider)
              await checkRoles(contract, accounts[0])
              await checkPauseStatus(contract)
            } else {
              // Account is no longer available, clear stored state
              localStorage.removeItem('walletConnected')
              localStorage.removeItem('lastConnectedAccount')
              localStorage.removeItem('lastNetwork')
            }
          }
        } catch (err) {
          console.error("Failed to check connection:", err)
          // Clear stored connection state if there's an error
          localStorage.removeItem('walletConnected')
          localStorage.removeItem('lastConnectedAccount')
          localStorage.removeItem('lastNetwork')
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
      window.ethereum.on("chainChanged", async () => {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const network = await provider.getNetwork()
        const detectedNetwork = CHAIN_ID_TO_NETWORK[Number(network.chainId)] || DEFAULT_NETWORK
        updateTokenAddresses(detectedNetwork); // Update token addresses when chain changes
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

        {account && contract && lendingManagerContract && (
          <Dashboard
            contract={contract}
            lendingManagerContract={lendingManagerContract}
            account={account}
            isAdmin={isAdmin}
            isLiquidator={isLiquidator}
            provider={provider}
          />
        )}
      </div>
    </div>
  )
}