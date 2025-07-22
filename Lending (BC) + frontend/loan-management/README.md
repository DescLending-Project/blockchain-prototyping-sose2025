# Decentralized Loan Management Platform

A comprehensive blockchain-based lending platform with Hardhat backend and React frontend, featuring automated deployment, testing, and realistic mockup simulations.

## 🚀 SUPER EASY SETUP (Recommended)

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- MetaMask browser extension

### One-Command Setup

```bash
# Start everything with one command
./start-dev.sh

# Or use npm
npm run start
```

This will:
- ✅ Install all dependencies
- ✅ Start Hardhat node
- ✅ Deploy all contracts
- ✅ Start frontend server
- ✅ Show you the next steps

### MetaMask Setup (Required)

After running the setup script, you need to configure MetaMask:

1. **Add Localhost Network:**
   - Network Name: `Localhost 8545`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

2. **Import Test Account:**
   - Use Account #0: `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

See [METAMASK-SETUP.md](./METAMASK-SETUP.md) for detailed instructions.

### Access Your Application

- **Frontend**: http://localhost:5173
- **Hardhat Node**: http://localhost:8545

### Stop Development Environment

```bash
# Stop everything
./stop-dev.sh

# Or use npm
npm run stop
```

---

## 🔧 Manual Setup (Alternative)

If you prefer manual control or need to deploy to testnets:

### 1. Install Dependencies

#### Backend (Hardhat)
```bash
cd backend
npm install
```

#### Frontend (React)
```bash
cd frontend
npm install
```

### 2. Automated Local Development Setup

The easiest way to get started is using our automation script:

```bash
cd backend
node scripts/automate-localhost-reset.js
```

This script will:
- ✅ Kill any existing Hardhat nodes
- ✅ Clean up deployment logs
- ✅ Start a new Hardhat node
- ✅ Deploy all contracts
- ✅ Run realistic mockup simulations
- ✅ Update frontend contract addresses automatically

### 3. Start Frontend

In a new terminal:
```bash
cd frontend
npm run dev
```

Your frontend will be available at: http://localhost:5173 (or http://localhost:5174 if 5173 is in use)

---

## 🔑 Test Accounts for Local Development

### Primary Test Accounts

| Account | Address | Private Key | Role | Purpose |
|---------|---------|-------------|------|---------|
| **#0** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | **Deployer/Admin** | **Use this for admin functions** |
| **#1** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | User | General testing |
| **#2** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | **Lender** | **Mockup simulation lender** |
| **#3** | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` | **Borrower** | **Mockup simulation borrower** |

### Mockup Simulation Accounts

The automation script automatically uses these accounts for realistic testing:

- **Lender Account (#2)**: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
  - Deposits funds into the pool
  - Earns interest over time
  - Tests withdrawal functionality

- **Borrower Account (#3)**: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`
  - Deposits collateral
  - Borrows funds
  - Tests repayment scenarios

### How to Import into MetaMask:
1. Open MetaMask
2. Click on the account dropdown (top right)
3. Select "Import Account"
4. Paste the private key (without the `0x` prefix)
5. Click "Import"

**💡 Recommendation**: Start with Account #0 (deployer) as it has admin rights and can perform all functions.

---

## 🔧 Advanced Manual Setup

If you prefer manual control or need to deploy to testnets:

### 1. Environment Configuration

Create a `.env` file in the `backend` directory:
```env
# SONIC testnet RPC URL
FTM_RPC_URL=https://rpc.blaze.soniclabs.com

# Private key of the wallet that will deploy the contract (no quotes)
PRIVATE_KEY=your_private_key_without_quotes

# Optional: For other networks
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
```

### 2. Compile Smart Contracts
```bash
cd backend
npx hardhat compile
```

### 3. Deploy Contracts

#### Local Development
```bash
npx hardhat run scripts/deployAll.js --network localhost
```

#### Sonic Testnet
```bash
npx hardhat run scripts/deployAll.js --network sonic
```

#### Sepolia Testnet
```bash
npx hardhat run scripts/deployAll.js --network sepolia
```

### 4. Update Frontend Addresses

The deployment script automatically updates `frontend/src/App.jsx` with the latest contract addresses. If you need to update manually:

1. Copy the deployed addresses from the deployment output
2. Update the constants in `frontend/src/App.jsx`:
   ```javascript
   const POOL_ADDRESS = "your_liquidity_pool_address";
   const LENDING_MANAGER_ADDRESS = "your_lending_manager_address";
   ```

### 5. Start Frontend
```bash
cd frontend
npm run dev
```

---

## 🧪 Testing

### Run All Tests
```bash
cd backend
npx hardhat test
```

### Run Tests with Coverage
```bash
cd backend
npx hardhat coverage
```

### Run Specific Test File
```bash
npx hardhat test test/LendingManager.test.js
```

---

## 📊 Mockup Simulation

The platform includes a comprehensive mockup simulation that creates realistic lending and borrowing scenarios:

### Features:
- **Lender Simulation**: Deposits, interest accrual, withdrawals
- **Borrower Simulation**: Collateral deposits, borrowing, repayments
- **Credit Score Management**: Dynamic credit scoring
- **Transaction History**: Realistic activity patterns

### Run Mockup Manually
```bash
cd backend
npx hardhat run scripts/run-mockup-after-deploy.js --network localhost
```

---

## 🏗️ Contract Architecture

### Core Contracts:
- **LiquidityPool**: Manages deposits, withdrawals, and interest distribution
- **LendingManager**: Handles borrowing, collateral management, and credit scoring
- **StablecoinManager**: Manages stablecoin parameters and liquidation thresholds
- **GlintToken**: Native platform token
- **MockPriceFeed**: Price oracle for local testing

### Network Support:
- **Localhost**: Full local development with mock tokens
- **Sonic Testnet**: Production-like testing environment
- **Sepolia Testnet**: Ethereum testnet deployment

---

## 🔄 Development Workflow

### Daily Development:
1. **Start fresh environment:**
   ```bash
   cd backend
   node scripts/automate-localhost-reset.js
   ```

2. **Start frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Make changes and test**

4. **Run tests:**
   ```bash
   cd backend
   npx hardhat test
   npx hardhat coverage
   ```

### Contract Upgrades:
To upgrade existing contracts:
```bash
npx hardhat run scripts/upgrade.js --network <network_name>
```

---

## 🐛 Troubleshooting

### Common Issues:

#### "You are not inside a Hardhat project"
- Make sure you're in the `backend` directory when running Hardhat commands

#### "Contract not deployed at address"
- Run the automation script to redeploy contracts
- Restart the frontend after deployment
- Clear browser cache

#### "Failed to initialize contracts"
- Check that Hardhat node is running
- Verify contract addresses in `frontend/src/App.jsx`
- Ensure you're connected to the correct network in MetaMask

#### "Insufficient funds"
- The automation script funds test accounts automatically
- For manual testing, transfer ETH to your test accounts

### Reset Everything:
```bash
cd backend
node scripts/automate-localhost-reset.js
```

---

## 📁 Project Structure

```
loan-management/
├── backend/                 # Hardhat project
│   ├── contracts/          # Smart contracts
│   ├── scripts/            # Deployment and automation scripts
│   ├── test/               # Test files
│   └── hardhat.config.js   # Hardhat configuration
├── frontend/               # React application
│   ├── src/
│   │   ├── App.jsx         # Main application
│   │   └── components/     # React components
│   └── package.json
└── README.md
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `npx hardhat test`
6. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License.

## Mock Development Flow (Local Testing)

To run the full mock environment for local development/testing:

1. **Start a Hardhat node**
   ```bash
   cd backend
   npx hardhat node
   ```
2. **Deploy contracts**
   ```bash
   cd backend
   npx hardhat run scripts/deployAll.js --network localhost
   ```
3. **Run the mock transaction and frontend script**
   ```bash
   cd .. # project root
   bash mock-dev.sh
   ```
   - This will run mock transactions (lender/borrower/proposal actions) and start the frontend dev server.
4. **Open the frontend**
   - Visit the URL shown in the terminal (e.g., http://localhost:5173/)

This will give you a fully mocked environment with realistic protocol activity for frontend testing.

