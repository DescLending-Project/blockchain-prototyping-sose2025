#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Loan Management Platform Development Environment${NC}"
echo "=================================================="

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js v16 or higher.${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}❌ npm is not installed. Please install npm.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Kill any existing Hardhat nodes
echo -e "${YELLOW}🔄 Stopping any existing Hardhat nodes...${NC}"
pkill -f "hardhat node" || true
sleep 2

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing root dependencies...${NC}"
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
    cd backend
    npm install
    cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    cd ..
fi

# Start Hardhat node in background
echo -e "${YELLOW}🔗 Starting Hardhat node...${NC}"
cd backend
npx hardhat node > ../hardhat-node.log 2>&1 &
HARDHAT_PID=$!
cd ..

# Wait for Hardhat node to start
echo -e "${YELLOW}⏳ Waiting for Hardhat node to start...${NC}"
sleep 5

# Check if Hardhat node is running
if ! curl -s http://127.0.0.1:8545 > /dev/null; then
    echo -e "${RED}❌ Failed to start Hardhat node${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Hardhat node started successfully${NC}"

# Deploy contracts using the simpler deployment script
echo -e "${YELLOW}📄 Deploying smart contracts...${NC}"
cd backend
npx hardhat run scripts/simple-deploy.js --network localhost
cd ..

# Check if deployment was successful
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Contract deployment failed${NC}"
    echo -e "${YELLOW}💡 Try running the deployment manually:${NC}"
    echo "cd backend && npx hardhat run scripts/simple-deploy.js --network localhost"
    exit 1
fi

echo -e "${GREEN}✅ Contracts deployed successfully${NC}"

# Start frontend
echo -e "${YELLOW}🌐 Starting frontend development server...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
sleep 3

echo ""
echo -e "${GREEN}🎉 Development environment is ready!${NC}"
echo "=================================================="
echo -e "${BLUE}📱 Frontend:${NC} http://localhost:5173 (or http://localhost:5174)"
echo -e "${BLUE}🔗 Hardhat Node:${NC} http://localhost:8545"
echo ""
echo -e "${YELLOW}🔑 MetaMask Setup:${NC}"
echo "1. Open MetaMask"
echo "2. Add network: Localhost 8545"
echo "3. Import one of the test accounts (see README.md for private keys)"
echo ""
echo -e "${YELLOW}📋 Key Test Accounts:${NC}"
echo -e "${GREEN}Account #0 (Deployer/Admin):${NC} 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo -e "${BLUE}Account #2 (Mockup Lender):${NC} 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
echo -e "${BLUE}Account #3 (Mockup Borrower):${NC} 0x90F79bf6EB2c4f870365E785982E1f101E93b906"
echo ""
echo -e "${YELLOW}💡 Recommendation:${NC} Start with Account #0 (deployer) - it has admin rights"
echo ""
echo -e "${YELLOW}🛑 To stop the development environment:${NC}"
echo "Press Ctrl+C or run: ./stop-dev.sh"
echo ""

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping development environment...${NC}"
    kill $HARDHAT_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    pkill -f "hardhat node" || true
    pkill -f "vite" || true
    echo -e "${GREEN}✅ Development environment stopped${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Keep script running
echo -e "${BLUE}🔄 Development environment is running...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

# Wait for background processes
wait 