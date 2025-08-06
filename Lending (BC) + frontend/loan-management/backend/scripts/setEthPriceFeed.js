// setupETH.js - Run this once after deployment
const { ethers } = require("hardhat");

async function setupETHCollateral() {
    //const provider = new ethers.BrowserProvider(window.ethereum);
    const [signer] = await ethers.getSigners();
    console.log("Using signer:", signer.address);
    // Replace with your actual contract addresses
    const COLLATERAL_CONTRACT = "0x9066c968702c79c83EF174DAE83D951Ef5D47dce";
    const LIQUIDITY_POOL_CORE = "0xD360c07dC92e54EC3D2FEBc6bc6d51Af9d787D84";
    
    // ETH/USD price feed on Sepolia
    const ETH_USD_FEED_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
    
    // Get contracts
    const collateralContract = new ethers.Contract(
        COLLATERAL_CONTRACT,
        [
            "function setPriceFeed(address token, address feed) external",
            "function getPriceFeed(address token) view returns (address)"
        ],
        signer
    );
    
    try {
        // Check current price feed
        const currentFeed = await collateralContract.getPriceFeed("0x0000000000000000000000000000000000000000");
        console.log("Current ETH price feed:", currentFeed);
        
        if (currentFeed === "0x45c72D244067EA046c52A62BCeb6f543Ca9F3C17") {
            console.log("Setting ETH price feed...");
            const tx = await collateralContract.setPriceFeed(
                "0x0000000000000000000000000000000000000000",
                ETH_USD_FEED_SEPOLIA
            );
            await tx.wait();
            console.log("ETH price feed set successfully!");
        } else {
            console.log("ETH price feed already configured");
        }
    } catch (error) {
        console.error("Error setting up ETH collateral:", error);
    }
}

setupETHCollateral();