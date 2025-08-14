# 🏦 Decentralized Lending Platform

A modern blockchain-based lending platform built with React and Ethereum smart contracts. This platform allows users to lend, borrow, and manage liquidity pools with advanced features like governance, credit scoring, and zero-knowledge proofs.

## ⚙️ Environment Setup

### Create Environment File
Before starting, create a `.env` file in the `backend` folder:

1. Copy the example file:
```bash
cd backend
cp .env.example .env
```

2. Edit the `.env` file and add your private key:
```env
# Required: Private key for contract deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# Optional: RPC URLs for testnets (only needed for testnet deployment)
FTM_RPC_URL=https://rpc.blaze.soniclabs.com
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
```

**⚠️ Important**:
- Remove the `0x` prefix from your private key
- For local development, you can use any test private key
- **To export from MetaMask**: Go to Account Details → Export Private Key
- Never use real funds or mainnet private keys

## 🚀 Quick Start Guide

### Prerequisites

Before you begin, make sure you have these installed on your computer:

1. **Node.js** (version 16 or higher)
   - Download from: https://nodejs.org/
   - Choose the LTS version

2. **npm** or **yarn** (comes with Node.js)
   - npm is included with Node.js
   - For yarn: `npm install -g yarn`

3. **MetaMask Browser Extension**
   - Install from: https://metamask.io/
   - Create a wallet if you don't have one

4. **Git** (to clone the repository)
   - Download from: https://git-scm.com/

---

## 📦 Installation

### Step 1: Clone the Repository
```bash
git clone https://github.com/DescLending-Project/blockchain-prototyping-sose2025.git
cd "blockchain-prototyping-sose2025/Lending (BC) + frontend/loan-management"
```

### Step 2: Install Dependencies
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Go back to root directory
cd ..
```

---

## 🔧 Development Setup

### Step 1: Start the Local Blockchain Network (Hardhat)
Open a terminal and navigate to the backend folder:
```bash
cd backend
npx hardhat node
```
**Keep this terminal open!** This runs your local blockchain network.

### Step 2: Deploy Smart Contracts
Open a **new terminal** and navigate to the backend folder:
```bash
cd backend
npx hardhat run scripts/deployAll.js --network localhost
```

This will:
- ✅ Compile all smart contracts
- ✅ Deploy them to your local network
- ✅ Set up initial configurations
- ✅ Run automatic mockup simulations
- ✅ Transfer admin rights to the DAO/Timelock system

### Step 3: Start the Frontend
Open a **third terminal** and navigate to the root folder:
```bash
npm run dev
```

The frontend will start at: **http://localhost:5173**

---

## 🦊 MetaMask Setup

### Add Local Network to MetaMask

1. Open MetaMask extension
2. Click the network dropdown (top of MetaMask)
3. Click "Add network" → "Add network manually"
4. Fill in these details:
   - **Network Name**: `Localhost 8545`
   - **New RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`
5. Click "Save"

### Import Test Accounts

The system creates several test accounts with different roles. Import these into MetaMask:

#### 💰 Lender Accounts
- **Lender 1**
  - **Private Key**: `59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`
  - **Address**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`

- **Lender 2**
  - **Private Key**: `5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`
  - **Address**: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`

#### 🏠 Borrower Accounts
- **Borrower 1**
  - **Private Key**: `7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6`
  - **Address**: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`

- **Borrower 2**
  - **Private Key**: `47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a`
  - **Address**: `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`

#### 🏛️ Deployer Account (Initial Setup Only)
- **Role**: Used for initial deployment, then admin rights transfer to DAO
- **Private Key**: `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Address**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

**How to import:**
1. Click MetaMask account dropdown
2. Select "Import Account"
3. Paste the private key (without quotes)
4. Click "Import"

---

## 🎮 Using the Platform

### Step 1: Connect Your Wallet
1. Visit **http://localhost:5173**
2. Click "Connect Wallet"
3. Select MetaMask
4. Choose one of your imported accounts
5. Make sure you're on the "Localhost 8545" network

### Step 2: Explore Different Roles

#### As a Lender 💰
- Switch to a lender account in MetaMask
- Deposit ETH into the liquidity pool
- Earn interest on your deposits
- Withdraw funds when needed

#### As a Borrower 🏠
- Switch to a borrower account in MetaMask
- Deposit collateral (GLINT tokens)
- Borrow ETH against your collateral
- Repay loans to maintain healthy positions

---

## 🧪 Testing & Development

### Run Tests
```bash
cd backend
npx hardhat test
```

### Check Test Coverage
```bash
cd backend
npx hardhat coverage
```

<img width="742" height="380" alt="coverage3" src="https://github.com/user-attachments/assets/e77245c7-4699-46ce-9111-847c07aea79f" />


### Generate Mock Transactions
To populate the frontend with realistic data:
```bash
cd backend
npx hardhat run scripts/mockTransactions.js --network localhost
```

This creates sample transactions for testing the user interface.

**Note**: After running mock transactions, you may need to refresh your frontend browser tab to see the updated data.

---

## 🔮 Advanced Features

### Zero-Knowledge Proofs (ZK)
The platform includes experimental ZK proof functionality for enhanced privacy:

```bash
cd backend
npx hardhat run scripts/deployAll-ZK.js --network localhost
```

This deploys additional contracts for:
- Private credit scoring
- Confidential transaction verification
- Advanced privacy features

### Automated Mockup Simulation
The `run-mockup-after-deploy.js` script creates realistic platform activity:

- **Lender Simulation**: 2 months of lending activity with deposits, withdrawals, and interest claims
- **Borrower Simulation**: Multiple borrow/repay cycles with collateral management
- **Credit Score Updates**: Dynamic credit scoring based on behavior

This runs automatically after deployment but can be triggered manually:
```bash
cd backend
npx hardhat run scripts/run-mockup-after-deploy.js --network localhost
```

---

## 🛠️ Troubleshooting

### Common Issues

#### "Connect Wallet" Button Not Working
- ✅ Make sure MetaMask is installed and unlocked
- ✅ Verify you're on the "Localhost 8545" network
- ✅ Check that the Hardhat node is running

#### MetaMask Loads But Won't Connect
If MetaMask opens but doesn't connect to the application:
- ✅ **Open MetaMask in a separate tab**: Click the MetaMask extension icon and select "Expand view" to open it in a full browser tab
- ✅ **Keep MetaMask tab open**: Leave the expanded MetaMask tab open while using the application
- ✅ **Log in manually**: Make sure you're logged into MetaMask in the expanded tab
- ✅ **Try connecting again**: Return to the application and click "Connect Wallet"

> **💡 Tip**: Sometimes MetaMask needs to be opened and logged into separately before it can connect to web applications. Opening it in an expanded view helps establish a stable connection.

#### "Transaction Failed" Errors
- ✅ Ensure you have enough ETH for gas fees
- ✅ Try refreshing the page
- ✅ Switch to a different account if needed

#### "Contract Not Found" Errors
- ✅ Make sure contracts are deployed: `npx hardhat run scripts/deployAll.js --network localhost`
- ✅ Restart the Hardhat node if needed
- ✅ Clear browser cache and refresh

### Reset Everything
If something goes wrong, restart from scratch:

1. Stop all running processes (Ctrl+C in terminals)
2. Restart Hardhat node: `cd backend && npx hardhat node`
3. Redeploy contracts: `npx hardhat run scripts/deployAll.js --network localhost`
4. Restart frontend: `npm run dev`

---

## 📁 Project Structure

```
loan-management/
├── backend/                   # Smart contracts and blockchain logic
│   ├── contracts/             # Solidity smart contracts
│   ├── scripts/               # Deployment and utility scripts
│   ├── test/                  # Contract tests
│   ├── .env                   # Environment variables (create this)
│   └── hardhat.config.js      # Blockchain configuration
├── frontend/                  # React web application
│   ├── src/                   # Frontend source code
│   └── package.json           # Frontend dependencies
└── README.md                  # This file
```

---

## ⛽ Gas Cost Analysis

### Running Gas Analysis Scripts

To measure the actual gas costs of deploying and using the lending system, we provide comprehensive gas analysis scripts:

#### Prerequisites
1. **Start local Hardhat node**:
   ```bash
   cd backend
   npx hardhat node
   ```

2. **Run gas analysis** (in a new terminal):
   ```bash
   cd backend
   npx hardhat run scripts/gasAnalysis.js --network localhost
   ```

#### Available Scripts
- **`gasAnalysis.js`** - Complete system analysis (deployment + methods + full cycle)
- **`deploymentCostAnalysis.js`** - Detailed deployment cost breakdown
- **`lendingCycleAnalysis.js`** - User journey gas measurements
- **`runGasAnalysis.js`** - Master script that runs all analyses

#### Key Findings (Actual Measurements)
| Operation | Gas Cost | ETH (25 gwei) | USD Cost* |
|-----------|----------|---------------|-----------|
| **System Deployment** | 11,390,516 | 0.285 ETH | ~$1,283 |
| **Single Borrow** | 385,549 | 0.0096 ETH | ~$43 |
| **Complete User Cycle** | 729,706 | 0.0182 ETH | ~$82 |
| **Deposit Collateral** | 163,764 | 0.0041 ETH | ~$18 |
| **Repay Loan** | 105,906 | 0.0026 ETH | ~$12 |

*Assuming ETH = $4,500

**Note:** Production deployment costs are higher at 19,562,732 gas (0.489 ETH = ~$2,201) when including all real contracts (governance, ZK verifiers, etc.) rather than just testing contracts.

#### Cost Optimization Recommendations
- **Layer 2 Deployment**: Deploy on Polygon/Arbitrum for 90% cost reduction
- **Transaction Batching**: Combine multiple operations to save gas
- **Off-peak Usage**: Transact during low gas price periods

For detailed analysis results, see:
- `backend/REAL_GAS_ANALYSIS_RESULTS.md` - Complete analysis report
- `backend/FINAL_GAS_SUMMARY.md` - Executive summary with recommendations

---

## 🎯 What You Can Do

### Lending Features
- 💰 Deposit ETH to earn interest
- 📈 Track your earnings in real-time
- 💸 Withdraw funds with flexible terms
- 📊 View detailed transaction history

### Borrowing Features
- 🏠 Use crypto as collateral
- 💳 Borrow against your assets
- 📱 Monitor loan health ratios
- 🔄 Flexible repayment options

### Governance Features
- 🗳️ Vote on protocol changes
- 📝 Create improvement proposals
- 🏆 Earn rewards for participation
- 📈 Track governance analytics

### Advanced Features
- 🔐 Zero-knowledge privacy proofs
- 🎯 Dynamic credit scoring
- 📊 Comprehensive analytics
- 📱 Mobile-responsive design

---

## 🆘 Need Help?

If you encounter any issues:

1. **Check the browser console** for error messages (F12 → Console)
2. **Verify all terminals are running** (Hardhat node, frontend server)
3. **Make sure MetaMask is properly configured** with the localhost network
4. **Try the troubleshooting steps** above

---

## 🎉 Success!

If everything is working correctly, you should see:
- ✅ MetaMask connects successfully
- ✅ Account balances display correctly
- ✅ Transactions process smoothly
- ✅ Real-time updates in the interface

