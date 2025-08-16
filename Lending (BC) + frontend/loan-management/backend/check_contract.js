const { ethers } = require("ethers"); 
const addresses = require("../frontend/src/addresses.json");
async function checkContract() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const code = await provider.getCode(addresses.LiquidityPool);
  console.log("Contract code exists:", code !== "0x");
  const abi = require("./artifacts/contracts/LiquidityPool.sol/LiquidityPool.json").abi;
  const contract = new ethers.Contract(addresses.LiquidityPool, abi, provider);
  try {
    const balance = await contract.getBalance();
    console.log("getBalance result:", balance.toString());
  } catch (error) {
    console.log("getBalance error:", error.message);
  }
}
checkContract();
