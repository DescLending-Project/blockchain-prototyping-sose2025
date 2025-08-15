# Troubleshooting Guide

## 🚨 Wallet Connection Issues

### Problem: Connect Button Stays Grey

**Symptoms:**
- Connect button remains grey/unclickable
- No error message appears
- MetaMask is installed and unlocked

**Solutions:**

1. **Check Network Connection**
   ```bash
   # Make sure Hardhat node is running
   curl http://127.0.0.1:8545
   ```
   If this fails, restart the development environment:
   ```bash
   ./stop-dev.sh
   ./start-dev.sh
   ```

2. **Verify MetaMask Network**
   - Open MetaMask
   - Make sure you're connected to "Localhost 8545" network
   - If not, add it manually:
     - Network Name: `Localhost 8545`
     - RPC URL: `http://127.0.0.1:8545`
     - Chain ID: `31337`
     - Currency Symbol: `ETH`

3. **Refresh the Page**
   - After switching networks, refresh your browser
   - Clear browser cache if needed

4. **Check Browser Console**
   - Open Developer Tools (F12)
   - Look for JavaScript errors
   - Check if MetaMask is detected

### Problem: "Unsupported Network" Error

**Symptoms:**
- Error message: "Unsupported network. Please switch to localhost or sepolia"

**Solutions:**

1. **Switch to Localhost Network**
   - In MetaMask, click the network dropdown
   - Select "Localhost 8545"
   - Refresh the page

2. **Add Localhost Network if Missing**
   - In MetaMask: Settings → Networks → Add Network
   - Network Name: `Localhost 8545`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

### Problem: "No Provider" Error

**Symptoms:**
- Error message: "Please install MetaMask to use this application"

**Solutions:**

1. **Install MetaMask**
   - Download from: https://metamask.io/
   - Install the browser extension
   - Create or import a wallet

2. **Unlock MetaMask**
   - Make sure MetaMask is unlocked
   - Enter your password if prompted

3. **Check Browser Compatibility**
   - MetaMask works best with Chrome, Firefox, Brave
   - Make sure you're not in incognito/private mode

### Problem: Contract Functions Not Working

**Symptoms:**
- Wallet connects successfully
- But transactions fail or buttons don't respond

**Solutions:**

1. **Use Correct Account**
   - For admin functions, use Account #0 (deployer)
   - Private Key: `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

2. **Check Account Balance**
   - Make sure your account has ETH for gas fees
   - Test accounts should have 10,000 ETH each

3. **Check Contract Deployment**
   ```bash
   # Verify contracts are deployed
   cd backend
   npx hardhat run scripts/check-contracts.js --network localhost
   ```

## 🔧 Development Environment Issues

### Problem: "Port Already in Use"

**Symptoms:**
- Error: "Port 8545 is already in use"
- Error: "Port 5173 is already in use"

**Solutions:**

1. **Stop Existing Processes**
   ```bash
   ./stop-dev.sh
   ```

2. **Kill Processes Manually**
   ```bash
   # Kill Hardhat node
   pkill -f "hardhat node"
   
   # Kill frontend server
   pkill -f "vite"
   ```

3. **Check What's Using the Port**
   ```bash
   # Check port 8545
   lsof -i :8545
   
   # Check port 5173
   lsof -i :5173
   ```

### Problem: Dependencies Not Installed

**Symptoms:**
- "Module not found" errors
- "Cannot find module" errors

**Solutions:**

1. **Install All Dependencies**
   ```bash
   npm run install:all
   ```

2. **Install Manually**
   ```bash
   # Root dependencies
   npm install
   
   # Backend dependencies
   cd backend && npm install && cd ..
   
   # Frontend dependencies
   cd frontend && npm install && cd ..
   ```

### Problem: Contract Deployment Fails

**Symptoms:**
- Error during contract deployment
- "Gas estimation failed" errors

**Solutions:**

1. **Check Hardhat Node**
   ```bash
   # Make sure node is running
   curl http://127.0.0.1:8545
   ```

2. **Restart Everything**
   ```bash
   ./stop-dev.sh
   ./start-dev.sh
   ```

3. **Check Logs**
   ```bash
   # Check Hardhat node logs
   tail -f hardhat-node.log
   ```

## 🌐 Network Issues

### Problem: Can't Connect to Testnets

**Symptoms:**
- "Network error" when trying to connect to Sepolia/Sonic
- RPC endpoint errors

**Solutions:**

1. **Check Environment Variables**
   ```bash
   # Make sure .env file exists in backend/
   cat backend/.env
   ```

2. **Use Different RPC Endpoints**
   - Try different Infura endpoints
   - Use Alchemy endpoints
   - Check if your RPC URL is correct

3. **Check Network Status**
   - Sepolia: https://sepolia.etherscan.io
   - Sonic: https://testnet.sonicscan.org

## 📱 Frontend Issues

### Problem: Page Won't Load

**Symptoms:**
- White screen
- "Cannot connect to server" error

**Solutions:**

1. **Check Frontend Server**
   ```bash
   # Make sure frontend is running
   curl http://localhost:5173
   ```

2. **Check for JavaScript Errors**
   - Open Developer Tools (F12)
   - Look for errors in Console tab

3. **Clear Browser Cache**
   - Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
   - Clear browser cache and cookies

### Problem: UI Not Responsive

**Symptoms:**
- Buttons don't respond
- Forms don't submit
- Loading states stuck

**Solutions:**

1. **Check JavaScript Console**
   - Open Developer Tools (F12)
   - Look for JavaScript errors

2. **Check Network Tab**
   - Look for failed API calls
   - Check if requests are being made

3. **Refresh the Page**
   - Sometimes React state gets stuck
   - Refresh to reset the application state

## 🆘 Still Having Issues?

If none of the above solutions work:

1. **Check the Logs**
   ```bash
   # Hardhat node logs
   tail -f hardhat-node.log
   
   # Frontend logs (in browser console)
   # Open Developer Tools → Console
   ```

2. **Restart Everything**
   ```bash
   ./stop-dev.sh
   sleep 5
   ./start-dev.sh
   ```

3. **Check System Resources**
   ```bash
   # Check if you have enough memory/CPU
   htop
   ```

4. **Ask for Help**
   - Check the browser console for specific error messages
   - Note down the exact steps that cause the issue
   - Include error messages and logs when asking for help 