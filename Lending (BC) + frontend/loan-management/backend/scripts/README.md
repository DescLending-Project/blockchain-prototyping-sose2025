# Scripts Directory - Essential Scripts Only

This directory contains only the essential scripts needed for deployment, testing, and analysis of the lending system.

---

## 🚀 **Deployment Scripts**

### **Primary Deployment Scripts**

#### **`deployAll.js`**
- **Purpose**: Main deployment script for the complete lending system
- **Usage**: `npx hardhat run scripts/deployAll.js --network <network>`
- **Deploys**: All core contracts (LiquidityPool, LendingManager, etc.)
- **Features**: Standard deployment without ZK features

#### **`deployAll2.js`** ⭐
- **Purpose**: Enhanced deployment script with additional features
- **Usage**: `npx hardhat run scripts/deployAll2.js --network <network>`
- **Deploys**: Complete system with improved configuration
- **Features**: Enhanced setup and configuration

#### **`deployAll-ZK.js`** ⭐
- **Purpose**: Deployment script with Zero-Knowledge proof integration
- **Usage**: `npx hardhat run scripts/deployAll-ZK.js --network <network>`
- **Deploys**: Full system with ZK verification capabilities
- **Features**: Includes RISC0 verifiers and credit scoring

#### **`deployIntegratedSystem.js`**
- **Purpose**: Deploy integrated system with all components
- **Usage**: `npx hardhat run scripts/deployIntegratedSystem.js --network <network>`
- **Deploys**: Complete integrated lending and credit system
- **Features**: Full integration testing setup

---

## ⛽ **Gas Analysis Scripts**

### **Comprehensive Gas Measurement**

#### **`gasAnalysis.js`** ⭐
- **Purpose**: Complete gas analysis for all system components
- **Usage**: `npx hardhat run scripts/gasAnalysis.js --network localhost`
- **Measures**: Deployment costs, method costs, full lending cycles
- **Output**: Detailed gas usage report with cost projections

#### **`deploymentCostAnalysis.js`** ⭐
- **Purpose**: Detailed analysis of deployment gas costs
- **Usage**: `npx hardhat run scripts/deploymentCostAnalysis.js --network localhost`
- **Measures**: Individual contract deployment costs
- **Output**: Contract-by-contract gas breakdown

#### **`lendingCycleAnalysis.js`** ⭐
- **Purpose**: Analysis of complete user lending journeys
- **Usage**: `npx hardhat run scripts/lendingCycleAnalysis.js --network localhost`
- **Measures**: Borrower, lender, and liquidation gas costs
- **Output**: End-to-end transaction cost analysis

#### **`runGasAnalysis.js`** ⭐
- **Purpose**: Master script that runs all gas analysis scripts
- **Usage**: `npx hardhat run scripts/runGasAnalysis.js --network localhost`
- **Executes**: All gas analysis scripts in sequence
- **Output**: Comprehensive gas analysis report

---

## 🧪 **Testing & Demo Scripts**

#### **`mockTransactions.js`** ⭐
- **Purpose**: Generate mock transactions for testing
- **Usage**: `npx hardhat run scripts/mockTransactions.js --network <network>`
- **Creates**: Sample lending transactions and interactions
- **Features**: Realistic transaction patterns for testing

---

## 🛠️ **Utility Scripts**

#### **`copy-artifacts.js`**
- **Purpose**: Copy contract artifacts to frontend
- **Usage**: `npx hardhat run scripts/copy-artifacts.js`
- **Function**: Copies ABIs and addresses for frontend integration
- **Target**: Updates frontend contract interfaces

#### **`update-app-addresses.js`**
- **Purpose**: Update contract addresses in application config
- **Usage**: `npx hardhat run scripts/update-app-addresses.js`
- **Function**: Updates deployed contract addresses
- **Target**: Application configuration files

---

## 📋 **Usage Examples**

### **Complete System Deployment**
```bash
# Deploy complete system with ZK features
npx hardhat run scripts/deployAll-ZK.js --network localhost

# Deploy enhanced system
npx hardhat run scripts/deployAll2.js --network mainnet

# Deploy basic system
npx hardhat run scripts/deployAll.js --network polygon
```

### **Gas Analysis**
```bash
# Start local node first
npx hardhat node

# Run complete gas analysis (in new terminal)
npx hardhat run scripts/runGasAnalysis.js --network localhost

# Run specific analysis
npx hardhat run scripts/gasAnalysis.js --network localhost
npx hardhat run scripts/deploymentCostAnalysis.js --network localhost
npx hardhat run scripts/lendingCycleAnalysis.js --network localhost
```

### **Testing & Demo**
```bash
# Generate mock transactions
npx hardhat run scripts/mockTransactions.js --network localhost

# Deploy integrated system for testing
npx hardhat run scripts/deployIntegratedSystem.js --network localhost
```

### **Utilities**
```bash
# Copy artifacts to frontend
npx hardhat run scripts/copy-artifacts.js

# Update app addresses
npx hardhat run scripts/update-app-addresses.js
```

---

## 🎯 **Script Categories**

### **⭐ Essential Scripts (Must Keep)**
- `deployAll2.js` - Enhanced deployment
- `deployAll-ZK.js` - ZK-enabled deployment  
- `mockTransactions.js` - Testing transactions
- `gasAnalysis.js` - Complete gas analysis
- `deploymentCostAnalysis.js` - Deployment costs
- `lendingCycleAnalysis.js` - User journey costs
- `runGasAnalysis.js` - Master gas analysis

### **🔧 Core Scripts**
- `deployAll.js` - Basic deployment
- `deployIntegratedSystem.js` - Integrated deployment

### **🛠️ Utility Scripts**
- `copy-artifacts.js` - Build utility
- `update-app-addresses.js` - Config utility

---

## 📊 **Gas Analysis Workflow**

1. **Start Local Node**: `npx hardhat node`
2. **Run Master Analysis**: `npx hardhat run scripts/runGasAnalysis.js --network localhost`
3. **Review Reports**: Check generated `.md` and `.json` files
4. **Individual Analysis**: Run specific scripts as needed

---

## 🚀 **Deployment Workflow**

1. **Choose Deployment Script**: Based on features needed
2. **Set Network**: Configure target network
3. **Run Deployment**: Execute chosen script
4. **Update Frontend**: Run `copy-artifacts.js`
5. **Update Config**: Run `update-app-addresses.js`

---

## 📝 **Notes**

- **Gas analysis scripts** require a running local Hardhat node
- **Deployment scripts** can target any configured network
- **ZK scripts** require RISC0 verifier setup
- **All scripts** include comprehensive error handling
- **Output files** are generated in the backend directory

---

## 🧹 **Cleanup Completed**

**Removed 30+ non-essential scripts including:**
- Debug scripts
- Duplicate deployment scripts  
- Development-only test scripts
- Deprecated functionality scripts
- Temporary fix scripts

**Kept 11 essential scripts** for production use, gas analysis, and core functionality.
