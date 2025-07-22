# Contract Artifacts Management

This document explains how to manage contract artifacts between the backend and frontend.

## Overview

The contract artifacts (ABI and bytecode) are generated in the backend when contracts are compiled, but the frontend needs access to these artifacts to interact with the deployed contracts. This setup automatically copies the necessary artifacts to the frontend and updates contract addresses in the frontend code.

## Scripts

### 1. Automatic Copying and Address Updates (Recommended)

The `deployAll.js` script automatically:
- Copies artifacts to frontend
- Updates contract addresses in `App.jsx`
- Handles network-specific token addresses

```bash
npx hardhat run scripts/deployAll.js --network <network>
```

### 2. Manual Copying

You can manually copy artifacts using any of these methods:

#### Using npm script:
```bash
npm run copy-artifacts
```

#### Using the shell script:
```bash
./copy-artifacts.sh
```

#### Using Node.js directly:
```bash
node scripts/copy-artifacts.js
```

## What Gets Copied

The following contract artifacts are copied from `backend/artifacts/contracts/` to `frontend/src/`:

- `LendingManager.json`
- `LiquidityPool.json`
- `StablecoinManager.json`

## What Gets Updated in App.jsx

The deployment script automatically updates these addresses in `frontend/src/App.jsx`:

- `CONTRACT_ADDRESS` - The main LiquidityPool contract address
- `GLINT` token address - The deployed GlintToken address
- `USDC` token address - Network-specific USDC address
- `USDT` token address - Network-specific USDT address

### Network-Specific Token Addresses

The system automatically uses the correct stablecoin addresses for different networks:

- **Sepolia**: Uses Sepolia testnet USDC/USDT addresses
- **Sonic**: Uses Sonic network USDC/USDT addresses  
- **Mainnet**: Uses Ethereum mainnet USDC/USDT addresses

## When to Copy Artifacts

You should copy artifacts whenever:

1. **Before deployment** - The `deployAll.js` script does this automatically
2. **After contract changes** - If you modify contract code and recompile
3. **After pulling updates** - If someone else updated the contracts
4. **Before running the frontend** - To ensure the frontend has the latest ABIs

## File Structure

```
backend/
├── artifacts/contracts/
│   ├── LendingManager.sol/LendingManager.json
│   ├── LiquidityPool.sol/LiquidityPool.json
│   └── StablecoinManager.sol/StablecoinManager.json
├── scripts/
│   ├── copy-artifacts.js
│   ├── update-app-addresses.js
│   ├── test-update-addresses.js
│   └── deployAll.js
└── copy-artifacts.sh

frontend/
└── src/
    ├── LendingManager.json
    ├── LiquidityPool.json
    ├── StablecoinManager.json
    └── App.jsx (automatically updated)
```

## Testing

You can test the address update functionality:

```bash
node scripts/test-update-addresses.js
```

This will update App.jsx with test addresses to verify the functionality works.

## Troubleshooting

### Error: "File not found"
- Make sure you've compiled the contracts first: `npx hardhat compile`
- Check that the contract names in `copy-artifacts.js` match your actual contract names

### Error: "Permission denied"
- Make the shell script executable: `chmod +x copy-artifacts.sh`

### Frontend can't find artifacts
- Verify the files exist in `frontend/src/`
- Check that the import paths in your frontend code are correct
- Make sure you've copied the artifacts after any contract changes

### Addresses not updated in App.jsx
- Check that the regex patterns in `update-app-addresses.js` match your App.jsx format
- Verify the network name is correctly detected
- Run the test script to verify functionality: `node scripts/test-update-addresses.js`

## Notes

- The artifacts are copied as-is, preserving the full structure including ABI, bytecode, and metadata
- The script will overwrite existing files in the frontend
- If a contract artifact is missing, the script will report an error and exit
- The script creates the frontend directory if it doesn't exist
- Address updates are network-aware and will use the correct stablecoin addresses for each network
- The CORAL token address remains unchanged as it's a fixed address 