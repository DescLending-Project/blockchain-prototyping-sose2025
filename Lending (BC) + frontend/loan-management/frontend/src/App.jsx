import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs'
import { Card } from './components/ui/card'
import { Alert, AlertDescription } from './components/ui/alert'
import { Button } from './components/ui/button'
import { Wallet, AlertCircle, RefreshCw, LogOut } from 'lucide-react'
import LiquidityPoolABI from './abis/LiquidityPool.json'
import LendingManagerABI from './abis/LendingManager.json'
import StablecoinManagerABI from './abis/StablecoinManager.json'  
import GlintTokenABI from './abis/GlintToken.json'                
import VotingTokenABI from './abis/VotingToken.json'              
import ProtocolGovernorABI from './abis/ProtocolGovernor.json'    
import IntegratedCreditSystemABI from './abis/IntegratedCreditSystem.json' 
import SimpleRISC0TestABI from './abis/SimpleRISC0Test.json'      // (if exists)
import CreditScoreABI from './abis/CreditScore.json'
import nullifierRegistryABI from './abis/NullifierRegistry.json'

import addresses from './addresses.json';
import { LenderPanel } from './components/liquidity-pool/lender/LenderPanel'
import BorrowerPanel from './components/liquidity-pool/borrower/BorrowerPanel'
import { LiquidatorPanel } from './components/liquidity-pool/liquidator/LiquidatorPanel'
import { AdminPanel } from './components/liquidity-pool/admin/AdminPanel'
import { Dashboard } from './components/liquidity-pool/Dashboard'
import { CollateralPanel } from './components/liquidity-pool/user/CollateralPanel'
import { DEFAULT_NETWORK } from './config/networks'
import { getContractAddresses as getAddresses } from './contractAddresses';

// Network-specific token addresses
const NETWORK_TOKENS = {
  localhost: {
    USDC: '0x0000000000000000000000000000000000000001', // Mock address for localhost
    USDT: '0x0000000000000000000000000000000000000002', // Mock address for localhost
  },
  sepolia: {
    USDC: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    USDT: '0x7169d38820dfd117c3fa1f22a697dba58d90ba06',
  },
  sonic: {
    USDC: '0xA4879Fed32Ecbef99399e5cbC247E533421C4eC6',
    USDT: '0x6047828dc181963ba44974801ff68e538da5eaf9',
  }
};

// Collateral tokens array - will be updated based on network
const COLLATERAL_TOKENS = [
  {
    address: '0x3155755b79aA083bd953911C92705B7aA82a18F9', // GLINT
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
    address: '0x0000000000000000000000000000000000000000', // USDC - unique mock address for localhost
    symbol: 'USDC',
    name: 'USD Coin',
    isStablecoin: true,
    decimals: 6
  },
  {
    address: '0x0000000000000000000000000000000000000000', // USDT - unique mock address for localhost
    symbol: 'USDT',
    name: 'Tether USD',
    isStablecoin: true,
    decimals: 6
  }
];

const CHAIN_ID_TO_NETWORK = {
  31337: 'localhost', // Hardhat localhost
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
  const [contracts, setContracts] = useState({})
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLiquidator, setIsLiquidator] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [userError, setUserError] = useState("")
  const [networkName, setNetworkName] = useState('localhost')
  const SUPPORTED_CHAINS = [31337, 11155111, 57054];

  const getContractAddresses = (networkName) => {
    const addresses = getAddresses(networkName);
    return {
      liquidityPool: addresses.LiquidityPool,
      lendingManager: addresses.LendingManager,
      interestRateModel: addresses.InterestRateModel,
      stablecoinManager: addresses.StablecoinManager,
      glintToken: addresses.GlintToken,
      votingToken: addresses.VotingToken,
      protocolGovernor: addresses.ProtocolGovernor,
      creditSystem: addresses.IntegratedCreditSystem,
      risc0Test: addresses.risc0Test,
      creditScoreVerifier: addresses.creditScoreVerifier,
      //nullifierRegistry: addresses.nullifierRegistry
    };
  };

  const initializeContracts = async (provider, signer, networkName) => {
    try {
      setIsLoading(true);
      setError("");

      // Clear previous contracts
      setContracts({});

      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      console.log(`Initializing contracts for network: ${networkName} (chainId: ${chainId})`);
      

      // Get contract addresses for the network
      const addresses = getContractAddresses(networkName);
      if (!addresses) {
        throw new Error(`No contract addresses found for network: ${networkName}`);
      }

      // Initialize contracts with proper error handling
      const contractInstances = {};

      try {
        // Check if contracts exist at the addresses
        console.log('Checking contract at liquidityPool address:', addresses.liquidityPool);
        const liquidityPoolCode = await provider.getCode(addresses.liquidityPool);
        console.log('LiquidityPool contract code:', liquidityPoolCode);
        if (liquidityPoolCode === '0x') {
          throw new Error(`No contract found at liquidityPool address: ${addresses.liquidityPool}`);
        }

        contractInstances.liquidityPool = new ethers.Contract(
          addresses.liquidityPool,
          LiquidityPoolABI.abi,
          signer
        );

        // Log contract instance details
        console.log('LiquidityPool contract instance created:', contractInstances.liquidityPool);
        console.log('LiquidityPool contract address:', contractInstances.liquidityPool.target);

        // Test the liquidityPool contract with a simple call
        console.log('Testing liquidityPool contract...');
        try {
          const balance = await contractInstances.liquidityPool.getBalance();
          console.log('✅ LiquidityPool contract is working, balance:', balance.toString());
        } catch (testError) {
          console.error('❌ LiquidityPool contract test failed:', testError);
          console.error('Error name:', testError.name);
          console.error('Error message:', testError.message);
          console.error('Error code:', testError.code);
          if (testError.data) {
            console.error('Error data:', testError.data);
          }
          throw new Error(`LiquidityPool contract is not working: ${testError.message}`);
        }

        contractInstances.lendingManager = new ethers.Contract(
          addresses.lendingManager,
          LendingManagerABI.abi,
          signer
        );

        contractInstances.stablecoinManager = new ethers.Contract(
          addresses.stablecoinManager,
          StablecoinManagerABI.abi,
          signer
        );

        contractInstances.glintToken = new ethers.Contract(
          addresses.glintToken,
          GlintTokenABI.abi,
          signer
        );

        contractInstances.votingToken = new ethers.Contract(
          addresses.votingToken,
          VotingTokenABI.abi,
          signer
        );

        contractInstances.protocolGovernor = new ethers.Contract(
          addresses.protocolGovernor,
          ProtocolGovernorABI.abi,
          signer
        );

        contractInstances.creditScoreVerifier = new ethers.Contract(
          addresses.creditScoreVerifier,
          CreditScoreABI.abi,
          signer
      );
        /*contractInstances.nullifierRegistry = new ethers.Contract(
          addresses.nullifierRegistry,
          nullifierRegistryABI.abi,
          signer
        );*/
        
        // Optional contracts (may not exist on all networks)
        if (addresses.creditSystem) {
          contractInstances.creditSystem = new ethers.Contract(
            addresses.creditSystem,
            IntegratedCreditSystemABI.abi,
            signer
          );
        }

        if (addresses.risc0Test) {
          contractInstances.risc0Test = new ethers.Contract(
            addresses.risc0Test,
            SimpleRISC0TestABI.abi,
            signer
          );
        }

        // Test contract connectivity
        console.log('Testing contract connectivity with getBalance...');
        try {
          const balance = await contractInstances.liquidityPool.getBalance();
          console.log('✅ Contract connectivity test passed, balance:', balance.toString());
        } catch (connectivityError) {
          console.error('❌ Contract connectivity test failed:', connectivityError);
          console.error('Error name:', connectivityError.name);
          console.error('Error message:', connectivityError.message);
          console.error('Error code:', connectivityError.code);
          if (connectivityError.data) {
            console.error('Error data:', connectivityError.data);
          }
        }

        // Set both the new contracts object and legacy contract references
        setContracts(contractInstances);
        setContract(contractInstances.liquidityPool); // Legacy compatibility
        setLendingManagerContract(contractInstances.lendingManager); // Legacy compatibility

        console.log("✅ Contracts initialized successfully");
        return contractInstances;

      } catch (contractError) {
        console.error("Contract initialization error:", contractError);
        throw new Error(`Failed to initialize contracts: ${contractError.message}`);
      }

    } catch (err) {
      console.error("Contract initialization failed:", err);
      setError(`Failed to initialize contracts: ${err.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

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
      const networkName = CHAIN_ID_TO_NETWORK[Number(network.chainId)] || 'localhost';
      setNetworkName(networkName);

      // 3. Initialize contracts with network context
      const contractInstances = await initializeContracts(provider, signer, networkName);
      if (!contractInstances) {
        throw new Error("Failed to initialize contracts");
      }

      setAccount(accounts[0]);
      setProvider(provider);

      // 4. Check roles and pause status using the legacy contract reference
      await checkRoles(contractInstances.liquidityPool, accounts[0]);
      await checkPauseStatus(contractInstances.liquidityPool);

      // 5. Update token addresses based on network
      updateTokenAddresses(networkName);

      // 6. Improved network change handler
      const handleNetworkChange = async (chainIdHex) => {
        const newChainId = parseInt(chainIdHex, 16);

        if (!SUPPORTED_CHAINS.includes(newChainId)) {
          const supportedNetworks = SUPPORTED_CHAINS.map(id => CHAIN_ID_TO_NETWORK[id]).join(' or ');
          setError(`Unsupported network. Please switch to ${supportedNetworks}`);
          return;
        }

        try {
          const newProvider = new ethers.BrowserProvider(window.ethereum);
          const newSigner = await newProvider.getSigner();
          const newNetworkName = CHAIN_ID_TO_NETWORK[newChainId] || 'localhost';

          await initializeContracts(newProvider, newSigner, newNetworkName);
          updateTokenAddresses(newNetworkName);
          setNetworkName(newNetworkName);
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
    } finally {
      // Clear loading state
      setIsLoading(false);
    }

    console.log('Current networkName:', networkName);
    console.log('Contract addresses for network:', addresses);
    console.log('CreditScore address:', addresses.creditScoreVerifier);

    // Validate all required addresses exist
    const contractAddresses = getContractAddresses(networkName);
    const requiredAddresses = ['liquidityPool', 'lendingManager', 'stablecoinManager', 'glintToken', 'votingToken', 'protocolGovernor', 'creditScoreVerifier'];
    for (const key of requiredAddresses) {
      if (!contractAddresses[key]) {
        console.error(`Missing address for ${key}. Available addresses:`, Object.keys(contractAddresses));
        throw new Error(`Missing address for ${key}`);
      }
      console.log(`${key}: ${contractAddresses[key]}`);
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
      setContracts({}) // Clear contracts object
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
      const networkName = CHAIN_ID_TO_NETWORK[chainId] || 'localhost';
      setNetworkName(networkName);

      // Initialize contracts with network name
      const contractInstances = await initializeContracts(provider, signer, networkName);

      if (!contractInstances) {
        throw new Error("Failed to initialize contracts");
      }

      setAccount(accounts[0]);
      setProvider(provider);

      await checkRoles(contractInstances.liquidityPool, accounts[0]);
      await checkPauseStatus(contractInstances.liquidityPool);

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
      const addressStr = String(address).toLowerCase();
      let ownerStr = null;
      try {
        const owner = await contract.owner();
        ownerStr = String(owner).toLowerCase();
        setIsAdmin(ownerStr === addressStr);
      } catch (err) {
        // If contract.owner() fails, assume not admin
        setIsAdmin(false);
      }
      // Only check LIQUIDATOR_ROLE if contract.hasRole exists
      if (typeof contract.hasRole === 'function') {
        try {
          const isLiquidator = await contract.hasRole(await contract.LIQUIDATOR_ROLE(), address);
          setIsLiquidator(isLiquidator || (ownerStr && ownerStr === addressStr));
        } catch (err) {
          setIsLiquidator(ownerStr && ownerStr === addressStr);
        }
      } else {
        setIsLiquidator(ownerStr && ownerStr === addressStr);
      }
    } catch (err) {
      console.error("Failed to check roles:", err);
      setIsAdmin(false);
      setIsLiquidator(false);
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
      const contract = new ethers.Contract(addresses.LiquidityPool, LiquidityPoolABI.abi, signer)

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
              // Create LiquidityPool contract instance
              const contract = new ethers.Contract(addresses.LiquidityPool, LiquidityPoolABI.abi, signer)
              // Create LendingManager contract instance
              const lendingManagerContract = new ethers.Contract(addresses.LendingManager, LendingManagerABI.abi, signer)

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
          <h1 className="text-2xl font-bold">Liquidity Pool</h1>
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
            contracts={contracts}
          />
        )}
      </div>
    </div>
  )
}