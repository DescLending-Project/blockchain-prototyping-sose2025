#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping Loan Management Platform Development Environment${NC}"
echo "=================================================="

# Stop Hardhat node
echo -e "${YELLOW}🔗 Stopping Hardhat node...${NC}"
pkill -f "hardhat node" || true

# Stop frontend development server
echo -e "${YELLOW}🌐 Stopping frontend development server...${NC}"
pkill -f "vite" || true

# Stop any other related processes
echo -e "${YELLOW}🧹 Cleaning up processes...${NC}"
pkill -f "npm run dev" || true
pkill -f "node scripts" || true

# Wait a moment for processes to stop
sleep 2

echo -e "${GREEN}✅ Development environment stopped successfully${NC}"
echo ""
echo -e "${BLUE}💡 To start again, run:${NC} ./start-dev.sh" 