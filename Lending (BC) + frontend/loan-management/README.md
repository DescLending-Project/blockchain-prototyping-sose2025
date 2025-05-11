# Decentralized-Loan-Management-Plattform
![s1](https://github.com/user-attachments/assets/14d8c73a-74e1-4433-af3b-43de05371938)

## 1. Install Dependencies
### Hardhat backend (root folder):
`npm install`
### React frontend
```
cd frontend
npm install
```
## 2. Set Up .env file
Create a .env file in the root project directory with the following content:
```
# SONIC testnet RPC URL
FTM_RPC_URL=https://rpc.blaze.soniclabs.com

# Private key of the wallet that will deploy the contract (no quotes)
PRIVATE_KEY=your_private_key_without_quotes
```
## 3. Compile smart contract
In the Hardhat backend (root folder):
`npx hardhat compile`
## 4. Deploy smart contract to Sonic Testnet
`npx hardhat run scripts/deploy.js --network sonicTestnet` <br/>
Copy the deployed contract address from the output (needed in the frontend).
## 5. Export ABI to frontend
`cp artifacts/contracts/LiquidityPool.sol/LiquidityPool.json frontend/src/LiquidityPool.json`
## 6. Add contract info to frontend
In `frontend/src/App.jsx`:
- Import the ABI:
```
import contractJson from "./LiquidityPool.json";
const ABI = contractJson.abi;
```
- Replace the contract address:
`const CONTRACT_ADDRESS = "your_deployed_contract_address";`
## 7. Run frontend app
```
cd frontend
npm run dev
```
## 8. Interact
- Connect MetaMask to Sonic testnet
- Add 0.1 Sonic to the contract
- Extract 0.05 Sonic (only as the contract owner)
- View contract balance

# 9. Upgrade to a new logic contract
To upgrade to a LiquidityPoolV2 with new logic:
```
contract LiquidityPoolV2 is LiquidityPoolV1 {
    function version() public pure returns (string memory) {
        return "V2";
    }
}
```
And in the `deploy.js` Hardhat script:
```
const LiquidityPoolV2 = await ethers.getContractFactory("LiquidityPoolV2");
await upgrades.upgradeProxy(proxyAddress, LiquidityPoolV2);

```

