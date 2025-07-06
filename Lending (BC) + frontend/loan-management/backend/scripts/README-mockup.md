# Mockup Platform Behavior Script

This script simulates realistic lending and borrowing behavior on the liquidity platform to populate the frontend dashboard with meaningful data.

## What it does

The mockup script creates two scenarios:

### 1. Lender Scenario (2 months of activity)
- **Account**: Uses the private key from your `.env` file
- **Initial deposit**: 50 ETH
- **Activity over 60 days**:
  - Claims interest every 7 days
  - Makes additional deposits of 5 ETH every 15 days
  - Requests and completes withdrawals of 10 ETH every 30 days
- **Result**: Shows APR, interest earned, and transaction history in the lender dashboard

### 2. Borrower Scenario (2 months of activity)
- **Account**: Creates a new borrower account
- **Credit score**: Set to 80
- **Collateral**: Deposits 1000 GLINT tokens initially, adds 200 more every 2 weeks
- **Activity over 8 weeks**:
  - Borrows 2 ETH when no debt
  - Repays 1.5 ETH when has debt
  - Alternates between borrowing and repaying
- **Result**: Shows credit score, current debt, collateral value, health ratio, and detailed transaction history

## How to run

### Option 1: Automatic (Recommended)
The mockup script runs automatically after `deployAll.js`:

```bash
npx hardhat run scripts/deployAll.js --network localhost
```

### Option 2: Manual
If you want to run it separately after deployment:

```bash
npx hardhat run scripts/run-mockup-after-deploy.js --network localhost
```

### Option 3: With custom addresses
If you have the contract addresses, you can set them as environment variables:

```bash
export LIQUIDITY_POOL_ADDRESS="0x..."
export LENDING_MANAGER_ADDRESS="0x..."
export GLINT_TOKEN_ADDRESS="0x..."
npx hardhat run scripts/run-mockup-after-deploy.js --network localhost
```

## What you'll see in the frontend

After running the mockup script, your frontend dashboard will show:

### Lender Dashboard
- **APR**: ~5% (based on tier system)
- **Interest earned**: Accumulated over 2 months
- **Transaction history**: Deposits, withdrawals, interest claims
- **Current balance**: Principal + earned interest

### Borrower Dashboard
- **Credit score**: 80 (good tier)
- **Current debt**: Varies based on borrow/repay cycle
- **Collateral value**: GLINT tokens worth ~$1500 USD
- **Health ratio**: Percentage of collateralization
- **Transaction history**: Multiple borrow and repay transactions

## Troubleshooting

### "Could not find deployed contract addresses"
Make sure you've run `deployAll.js` first. The mockup script reads contract addresses from the deployment log.

### "Insufficient funds" errors
The script funds the borrower account with 10 ETH from the deployer. Make sure your deployer account has enough ETH.

### "No interest to claim" messages
This is normal in the early days of the simulation. Interest accrues daily but may not be claimable immediately.

## Customization

You can modify the script to:
- Change the simulation duration (currently 60 days for lender, 8 weeks for borrower)
- Adjust deposit/borrow amounts
- Modify the credit score
- Change the collateral amount
- Add more complex scenarios

## Files

- `run-mockup-after-deploy.js`: Main mockup script
- `mockup-platform-behavior.js`: Alternative version with more features
- `deployAll.js`: Modified to automatically run the mockup after deployment 