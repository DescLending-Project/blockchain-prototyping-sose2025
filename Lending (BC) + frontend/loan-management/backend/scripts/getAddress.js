require("dotenv").config();
const { Wallet } = require("ethers");

const wallet = new Wallet(process.env.FANTOM_PRIVATE_KEY);
console.log("Your wallet address is:", wallet.address);
