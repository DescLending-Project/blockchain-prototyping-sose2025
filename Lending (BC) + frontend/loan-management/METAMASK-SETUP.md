# MetaMask Setup for Local Development

## Quick Setup Guide

### 1. Add Localhost Network to MetaMask

1. Open MetaMask
2. Click on the network dropdown (top of MetaMask, shows "Ethereum Mainnet" by default)
3. Click "Add network" → "Add network manually"
4. Fill in these details:
   - **Network Name**: `Localhost 8545`
   - **New RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`
   - **Block Explorer URL**: (leave empty)

### 2. Import Test Account

1. In MetaMask, click on the account dropdown (top right)
2. Select "Import Account"
3. Choose "Private Key"
4. Copy and paste one of these private keys (without the `0x` prefix):

#### Recommended Test Accounts:

**Account #0 (Deployer - has admin rights):**
- Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private Key: `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **💡 Start with this account - it can perform all functions**

**Account #2 (Mockup Lender):**
- Address: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- Private Key: `5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`
- **Used by automation script for lending simulation**

**Account #3 (Mockup Borrower):**
- Address: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`
- Private Key: `7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6`
- **Used by automation script for borrowing simulation**

### 3. Verify Setup

1. Make sure you're connected to "Localhost 8545" network
2. You should see a balance of 10,000 ETH in your imported account
3. Navigate to your frontend (usually http://localhost:5173)
4. Click "Connect Wallet" - it should now work!

## Troubleshooting

### Connection Button Stays Grey
- **Solution**: Make sure you're connected to the "Localhost 8545" network in MetaMask
- **Solution**: Ensure the Hardhat node is running (check if `./start-dev.sh` completed successfully)

### "Unsupported Network" Error
- **Solution**: Switch to "Localhost 8545" network in MetaMask
- **Solution**: Refresh the page after switching networks

### "No Provider" Error
- **Solution**: Make sure MetaMask is installed and unlocked
- **Solution**: Try refreshing the page

### Contract Functions Not Working
- **Solution**: Make sure you're using Account #0 (deployer) for admin functions
- **Solution**: Check the browser console for error messages

## Mockup Simulation Accounts

The automation script automatically uses these accounts to create realistic lending scenarios:

| Account | Role | Purpose |
|---------|------|---------|
| **#2** | **Lender** | Deposits funds, earns interest, tests withdrawals |
| **#3** | **Borrower** | Deposits collateral, borrows funds, tests repayments |

These accounts are automatically funded and used by the simulation script to demonstrate the platform's functionality.

## Quick Commands

```bash
# Start development environment
./start-dev.sh

# Stop development environment
./stop-dev.sh

# Or use npm scripts
npm run start
npm run stop
``` 