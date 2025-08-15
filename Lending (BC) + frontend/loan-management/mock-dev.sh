#!/bin/bash

# Kill all running frontend dev servers to ensure a clean environment
pkill -f "vite" || true
pkill -f "npm run dev" || true
pkill -f "yarn dev" || true
sleep 2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Loan Management Platform Mock Environment (Node & contracts must already be running/deployed)${NC}"
echo "=================================================="

# Check if Hardhat node is running
if ! lsof -i :8545 > /dev/null 2>&1; then
    echo -e "${RED}❌ Hardhat node is not running on port 8545. Please start it manually before running this script.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Hardhat node detected on port 8545${NC}"

# Optionally, run mock transactions here (add your mock tx logic if needed)
# Example: echo "Running mock transactions..."
# (Add your mock tx logic here if needed)

echo -e "${YELLOW}⚡ Running mock transactions...${NC}"
npx hardhat run backend/scripts/mockTransactions.js --network localhost
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Mock transactions failed${NC}"
    exit 1
fi

# Start the frontend dev server (after ensuring dependencies)
echo -e "${YELLOW}🚀 Starting frontend dev server...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    yarn install
fi
npm run dev &
cd .. 