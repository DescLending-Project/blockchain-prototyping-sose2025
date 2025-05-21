import { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import contractJson from "./LiquidityPoolV1.json";

// Replace with your deployed contract address
const CONTRACT_ADDRESS = "0xff3bb967163c2fD1650Adb6ad3DFa8fA15d5a0FA";

// Replace with your actual ABI from artifacts
const ABI = contractJson.abi;

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState("0");
  const [debt, setDebt] = useState("0");
  const [amount, setAmount] = useState("0");
  const [contractOwner, setContractOwner] = useState(null);
  const [borrowTime, setBorrowTime] = useState(null);
  const [userToScore, setUserToScore] = useState("");
  const [scoreToAssign, setScoreToAssign] = useState("");
  const [creditScore, setCreditScore] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

  // Connect wallet
  const connectWallet = async () => {
    if (window.ethereum) {
      const prov = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const signer = await prov.getSigner();
      const address = await signer.getAddress();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      setProvider(prov);
      setSigner(signer);
      setAccount(address);
      setContract(contract);

      const ownerAddress = await contract.owner();
      setContractOwner(ownerAddress);
      await fetchBorrowTime();

    } else {
      alert("Please install MetaMask");
    }
  };

  // Fetch balance
  const fetchBalance = async () => {
    if (contract) {
      const bal = await contract.getBalance();
      setBalance(ethers.formatEther(bal));
    }
  };

  // Fetch debt
  const fetchDebt = async () => {
    if (contract) {
      const userDebt = await contract.getMyDebt();
      setDebt(ethers.formatEther(userDebt));
    }
  };

  // Fetch credit score
  const fetchCreditScore = async () => {
    if (contract && account) {
      try {
        const score = await contract.creditScore(account);
        setCreditScore(Number(score));
      } catch (err) {
        console.error("Error fetching credit score:", err);
      }
    }
  };

  // Fetch contract owner
  const fetchContractOwner = async () => {
    if (contract) {
      const owner = await contract.owner();
      setContractOwner(owner);
    }
  };

  // Fetch borrow time
  const fetchBorrowTime = async () => {
    if (contract) {
      const timestamp = await contract.borrowTimestamp(account);
      setBorrowTime(new Date(Number(timestamp) * 1000).toLocaleString());
    }
  };

  // Add funds

  const handleAddFunds = async (amount) => {
    try {
      const tx = await signer.sendTransaction({
        to: CONTRACT_ADDRESS,
        value: ethers.parseEther(amount),
      });
      await tx.wait();
      fetchBalance();
    } catch (error) {
      console.error("Error adding funds:", error);
    }
  };

  // Extract funds
  const handleExtract = async () => {
    const tx = await contract.extract(ethers.parseEther("0.05"));
    await tx.wait();
    fetchBalance();
  };

  const handleBorrow = async () => {
    try {
      const tx = await contract.borrow(ethers.parseEther("0.05"));
      await tx.wait();
      fetchBalance();
      fetchDebt();
    } catch (error) {
      console.error("Error borrowing funds:", error);
    }
    await fetchBorrowTime();
    await fetchCreditScore();


  };

  const handleRepay = async () => {
    try {
      const tx = await contract.repay({ value: ethers.parseEther("0.05") });
      await tx.wait();
      fetchBalance();
      fetchDebt();
    } catch (error) {
      console.error("Error repaying funds:", error);
    }
    await fetchBorrowTime();

  };

  const handleAssignScore = async () => {
    try {
      const tx = await contract.setCreditScore(userToScore, parseInt(scoreToAssign));
      await tx.wait();
      alert(`Credit score of ${scoreToAssign} assigned to ${userToScore}`);
      setUserToScore("");
      setScoreToAssign("");
    } catch (error) {
      console.error("Error assigning credit score:", error);
      alert("Failed to assign score. Are you the owner?");
    }
    await fetchCreditScore();

  };

  const handleTogglePause = async () => {
    try {
      const tx = await contract.togglePause();
      await tx.wait();
      const pauseState = await contract.isPaused();
      setIsPaused(pauseState);
      alert(`Contract ${pauseState ? 'paused' : 'unpaused'} successfully`);
    } catch (error) {
      console.error("Error toggling pause state:", error);
      alert("Failed to toggle pause state. Are you the owner?");
    }
  };

  const disconnectWallet = async () => {
    setProvider(null);
    setSigner(null);
    setContract(null);
    setAccount(null);
    setContractOwner(null);
    setBalance("0");
    setDebt("0");
    setBorrowTime(null);
    setCreditScore(null);
  };

  // Auto fetch when contract changes
  useEffect(() => {
    if (contract) {
      fetchBalance();
      fetchDebt();
      fetchCreditScore();
      fetchContractOwner(); //for safeguarding, refetch owner in case of reload
      fetchBorrowTime(); // refetch borrow time
      const fetchPauseState = async () => {
        const pauseState = await contract.isPaused();
        setIsPaused(pauseState);
      };
      fetchPauseState();
    }
  }, [contract]);

  useEffect(() => {
    if (window.ethereum) {
      // Handle account changes
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          // User disconnected all accounts
          disconnectWallet();
        } else {
          // User switched accounts - reconnect with new account
          connectWallet();
        }
      });

      // Handle chain changes
      window.ethereum.on('chainChanged', () => {
        // Reload the page when chain changes
        window.location.reload();
      });
    }

    return () => {
      // Cleanup listeners when component unmounts
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', connectWallet);
        window.ethereum.removeListener('chainChanged', () => window.location.reload());
      }
    };
  }, []);

  return (
    <div>
      <nav className="navbar">
        <div className="nav-brand">DeFi Lending Pool</div>
        <div className="nav-wallet">
          <button className="connect-button" onClick={connectWallet}>
            {account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : "Connect Wallet"}
          </button>
          {account && (
            <button className="disconnect-button" onClick={disconnectWallet}>
              Disconnect
            </button>
          )}
        </div>
      </nav>

      <div className="app-container">
        <div className="main-content">
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Pool Balance</h3>
              <p>{balance} SONIC</p>
            </div>
            <div className="stat-card">
              <h3>Your Debt</h3>
              <p>{debt} SONIC</p>
            </div>
            <div className="stat-card">
              <h3>Credit Score</h3>
              <p>{creditScore !== null ? creditScore : "N/A"}</p>
            </div>
          </div>

          <div className="actions-grid">
            <div className="action-section">
              <h2>Add Liquidity</h2>
              <div className="button-group">
                <button className="action-button" onClick={() => handleAddFunds("0.1")}>
                  Add 0.1 SONIC
                </button>
                <div className="custom-amount">
                  <input
                    type="number"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                  <button onClick={() => handleAddFunds(amount)}>Add Custom Amount</button>
                </div>
              </div>
            </div>

            <div className="action-section">
              <h2>Lending Actions</h2>
              <div className="button-group">
                <button className="action-button" onClick={handleBorrow}>
                  Borrow 0.05 SONIC
                </button>
                <button className="action-button" onClick={handleRepay}>
                  Repay 0.05 SONIC
                </button>
              </div>
            </div>
          </div>

          {account &&
            contractOwner &&
            account.toLowerCase() === contractOwner.toLowerCase() && (
              <div className="admin-section">
                <h2>Admin Controls</h2>
                <button 
                  className={`admin-button ${isPaused ? 'paused' : ''}`} 
                  onClick={handleTogglePause}
                >
                  {isPaused ? 'Resume Contract' : 'Pause Contract'}
                </button>
                <button className="admin-button" onClick={handleExtract}>
                  Extract 0.05 SONIC
                </button>

                <div className="credit-score-controls">
                  <h3>Assign Credit Score</h3>
                  <div className="input-group">
                    <input
                      type="text"
                      placeholder="User wallet address"
                      value={userToScore}
                      onChange={(e) => setUserToScore(e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Score (0-100)"
                      min="0"
                      max="100"
                      value={scoreToAssign}
                      onChange={(e) => setScoreToAssign(e.target.value)}
                    />
                    <button onClick={handleAssignScore}>Assign Score</button>
                  </div>
                </div>
              </div>
            )}
        </div>

        {borrowTime && (
          <div className="info-footer">
            <p>Last Borrowed: {borrowTime}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
