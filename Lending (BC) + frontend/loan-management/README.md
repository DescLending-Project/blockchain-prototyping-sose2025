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
npx hardhat run scripts/deployAll-ZK.js --network localhost
```

**⚠️ Critical**: Both deployment scripts must be run in sequence:
1. **First**: `deployAll.js` - Deploys core lending contracts
2. **Second**: `deployAll-ZK.js` - Deploys ZK verifier and additional contracts

**Do not skip the second script!** The platform requires both deployments to function correctly.

This will:
- ✅ Compile all smart contracts
- ✅ Deploy them to your local network
- ✅ Set up initial configurations
- ✅ Run automatic mockup simulations
- ✅ Transfer admin rights to the DAO/Timelock system

### Step 3: Test the Platform (Optional)
Run the comprehensive test suite:
```bash
npx hardhat run scripts/mockTransactions.js --network localhost
```

This demonstrates all platform features including lending, borrowing, liquidations, and governance. Note: Any "Governance queue/execute failed" warnings can be ignored as the core voting functionality works correctly.

## 🔑 Test Accounts & Private Keys

The platform uses Hardhat's default test accounts. Here are the accounts and their private keys for testing:

**⚠️ WARNING: These are TEST ACCOUNTS ONLY. Never use these private keys on mainnet or with real funds!**

```
Account #0 (Deployer): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1 (Lender1): 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

Account #2 (Lender2): 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

Account #3 (Borrower1): 0x90F79bf6EB2c4f870365E785982E1f101E93b906
Private Key: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

Account #4 (Borrower2): 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
Private Key: 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

Account #5 (Other1): 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
Private Key: 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba

Account #6 (Other2): 0x976EA74026E726554dB657fA54763abd0C3a0aa9
Private Key: 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e

Account #7 (Other3): 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
Private Key: 0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356

Account #8 (Other4): 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f
Private Key: 0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97

Account #9 (Other5): 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
Private Key: 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6

Account #10 (Other6): 0xBcd4042DE499D14e55001CcbB24a551F3b954096
Private Key: 0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897

Account #11 (Other7): 0x71bE63f3384f5fb98995898A86B02Fb2426c5788
Private Key: 0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82

Account #12 (Other8): 0xFABB0ac9d68B0B445fB7357272Ff202C5651694a
Private Key: 0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1

Account #13 (Other9): 0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec
Private Key: 0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd

Account #14 (Other10): 0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097
Private Key: 0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa

Account #15 (Other11): 0xcd3B766CCDd6AE721141F452C550Ca635964ce71
Private Key: 0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61
```

### Step 4: Start the Frontend
Open a **third terminal** and navigate to the root folder:
```bash
npm run dev
```

The frontend will start at: **http://localhost:5173**

### Using Test Accounts with MetaMask

To interact with the platform, import the test account private keys into MetaMask:

1. **Open MetaMask** and click on the account icon
2. **Select "Import Account"**
3. **Paste one of the private keys** from the test accounts section above
4. **Connect to localhost:8545** (Hardhat network)

**Recommended accounts for testing:**
- **Lender1**: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`
- **Borrower1**: `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6`

---

## 🔐 RISC Zero Verifier Contracts Setup

### Overview
The platform uses RISC Zero verifier contracts for zero-knowledge proof verification, particularly for credit scoring functionality. These contracts need to be deployed separately from the main lending contracts.


### Deployment Steps

1. **Follow RISC Zero Documentation**
   - Refer to the [RISC Zero Readme](https://github.com/DescLending-Project/risc_zero_banking/blob/main/solidity/README.md) for the setup instructions
   - Follow the deployment guides for verifier contracts
   - Follow the instructions to proceed with the proof generation steps. You can first generate the Signatures & Nullifiers yourself (refer to Generating Proof Data section), or proceed with the test data. The account used for the proof generation will have its credit score automatically updated on the frontend after following the proof generation insturctions. 


2. **Manual Address Configuration**
   After successfully deploying the RISC Zero verifier contracts, you **must manually add** the creditScore contract address to two files:

   **File 1: `frontend/addresses.json`**
   ```json
   {
     "VotingToken": "0x...",
     "TimelockController": "0x...",
     // ... other contracts ...
     "creditScoreVerifier": "YOUR_DEPLOYED_VERIFIER_ADDRESS_HERE"
   }
   ```

   **File 2: `frontend/src/contractAddresses.js`**
   ```javascript
   export const CONTRACT_ADDRESSES = {
     localhost: {
       "VotingToken": "0x...",
       // ... other contracts ...
       "creditScoreVerifier": "YOUR_DEPLOYED_VERIFIER_ADDRESS_HERE"
     },
     // ... other networks
     // You can alternatively use this Sepolia deployment: 0x8b0AE475403343eB734E93da6AFb8f4BB83C2E96
   };
   ```

### Why Manual Configuration?
🔄 **Important**: The main deployment script (`deployAll.js`) overwrites the address files completely. Since RISC Zero verifier contracts are deployed separately, their addresses must be added manually after running the main deployment script.

### Deployment Order
1. ✅ Deploy main lending contracts: `npx hardhat run scripts/deployAll.js --network localhost` (or `--network sepolia` if configured)
2. ✅ Deploy RISC Zero verifier contracts (follow RISC Zero docs)
3. ✅ Manually add verifier contract addresses to the two files mentioned above
4. ✅ Restart the frontend: `npm run dev`



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

## TLSN Extension Setup
To use the TLSN Extension, it should be added to the Chrome browser via the Extensions menu. Please follow the setup instructions in this order:

1. **First**: Set up the shared TLS Notary library - [Shared README](../../Data%20Fetch%20(ZKTLS)/tls-notary/shared/README.md)
2. **Then**: Install the browser extension - [Browser Extension README](../../Data%20Fetch%20(ZKTLS)/tls-notary/browser-extension/README.md)

## 🔐 Generating Proof Data for RISC Zero Verifiers

### Overview
Before using the RISC Zero verifier contracts for zero-knowledge proofs, you need to generate the required input files. The platform includes a **Signature & Nullifier Generator** component that creates the necessary cryptographic data.


### Using the Signature & Nullifier Generator

#### Step 1: Navigate to "Signatures" tab and Select Accounts
- **Import (test) accounts**: Make sure you have imported the Hardhat accounts to your Metamask extension if you are using the localhost. 
- **Select accounts**: Choose which accounts you want to generate signatures and nullifiers for
  - Use "Test Accounts" button for quick selection of the first 5 standard Hardhat accounts OR proceed with the lender / borrower accounts
  - Or manually select specific accounts using checkboxes
- **Account switching**: You'll need to manually switch between MetaMask accounts during the process - as Metamask does not allow for signing with a different account than the one currently selected in the extension

#### Step 2: Generate Signatures & Nullifiers
1. Click **"Generate Signatures & Nullifiers"**
2. **Follow prompts**: The generator will ask you to switch MetaMask accounts when needed
3. **Sign messages**: For each account, you'll sign the fixed message `"Block 2"`
4. **Wait for completion**: The process generates cryptographic nullifiers using `SHA256(address_bytes + signature_bytes)`

#### Step 3: Download Required Files
After successful generation, download the following files needed for RISC Zero proofs:

**Essential Files for RISC Zero:**
- `user_owned_addresses.json` - List of account addresses
- `signatures.json` - Normalized signature data (v=0/1 format)
- `nullifiers.json` - 32-byte nullifier arrays
- `all_merkle_proofs.json` - Merkle proof template (This file is intended as a placeholder)

**Download Options:**
- **"Download Separate Files"**: Gets individual JSON files matching RISC Zero input requirements
- **"Download All"**: Complete results in single file for backup/debugging

#### Step 4: Use with RISC Zero Verifiers
1. **Place files**: Put the downloaded JSON files in your relevant RISC Zero project directory -> risc0_proofs -> defi_inputs_validation -> defi_inputs
2. **Follow RISC Zero docs**: Use these files as inputs for your zero-knowledge proof generation
3. **Verify compatibility**: Files are generated using the same algorithm as the original RISC Zero nullifiers

### Important Notes
⚠️ **Technical Details:**
- **Fixed Message**: All signatures use the message `"Block 2"` for consistency
- **Normalization**: Both signatures and nullifiers use normalized v values (0/1 instead of 27/28)
- **Algorithm**: Nullifiers generated using `SHA256(address_bytes + signature_bytes)`
- **Compatibility**: Output matches the format of original RISC Zero nullifiers.json files

🔄 **Manual Process**: 
- MetaMask requires manual account switching between signatures
- Follow the on-screen prompts to switch accounts when requested
- Each account generates one unique nullifier

💡 **Best Practice**: 
- Test with a few accounts first before generating for many accounts
- Keep the downloaded files secure as they contain cryptographic signatures if using real wallet addresses. The test accounts are public and should not be used for any real transactions!

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

⚠️ Note: If you encounter the error Proposal state is Defeated (expected Succeeded), simply restart the mock transactions command. This can happen when governance proposals don't receive enough votes due to timing issues or insufficient token distribution during the initial setup phase. The script will retry with fresh proposals and should succeed on subsequent runs.

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
- ✅ Make sure Risc0 Verifier contracts are also deployed (relate to the relevant section of the README). Alternatively, if you want to test the system without ZK functionality, you can comment out the Credit Score Verifier contract initialization from the "App.jsx" 
- ✅ Restart the Hardhat node if needed
- ✅ Clear browser cache and refresh

### Reset Everything
If something goes wrong, restart from scratch:

1. Stop all running processes (Ctrl+C in terminals)
2. Restart Hardhat node: `cd backend && npx hardhat node`
3. Redeploy contracts:
   ```bash
   npx hardhat run scripts/deployAll.js --network localhost
   npx hardhat run scripts/deployAll-ZK.js --network localhost
   ```
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
- ✅ Can generate signatures
- ✅ Upon successful proof generation, you will be able to see your RISC Zero verified credit score in the frontend
- ✅ Transactions process smoothly
- ✅ Real-time updates in the interface

