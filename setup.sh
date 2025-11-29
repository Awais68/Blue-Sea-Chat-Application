#!/bin/bash

# WebRTC Chat Application - Setup Script
# This script automates the installation process

set -e  # Exit on error

echo "============================================"
echo "WebRTC Chat Application - Setup Script"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js v16 or higher.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo -e "${RED}Node.js version 16 or higher is required. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm $(npm -v) found${NC}"

# Check MongoDB
if ! command -v mongod &> /dev/null; then
    echo -e "${YELLOW}⚠ MongoDB not found. Please install MongoDB or ensure it's running.${NC}"
    echo -e "${YELLOW}  You can continue, but the backend won't work without MongoDB.${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ MongoDB found${NC}"
fi

echo ""
echo -e "${BLUE}Setting up Backend...${NC}"

# Backend setup
cd "$SCRIPT_DIR/backend"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}  Please edit backend/.env if you need to change MongoDB URI or other settings${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo -e "${BLUE}Installing backend dependencies...${NC}"
npm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install backend dependencies${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Setting up Frontend...${NC}"

# Frontend setup
cd "$SCRIPT_DIR/frontend"

echo -e "${BLUE}Installing frontend dependencies...${NC}"
npm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Setup completed successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "1. Ensure MongoDB is running:"
echo -e "   ${YELLOW}sudo systemctl start mongodb${NC}"
echo -e "   or"
echo -e "   ${YELLOW}mongod${NC}"
echo ""
echo -e "2. Start the backend (in a new terminal):"
echo -e "   ${YELLOW}cd \"$SCRIPT_DIR/backend\"${NC}"
echo -e "   ${YELLOW}npm run dev${NC}"
echo ""
echo -e "3. Start the frontend (in another terminal):"
echo -e "   ${YELLOW}cd \"$SCRIPT_DIR/frontend\"${NC}"
echo -e "   ${YELLOW}npm run dev${NC}"
echo ""
echo -e "4. Open your browser to:"
echo -e "   ${YELLOW}http://localhost:3000${NC}"
echo ""
echo -e "${GREEN}Enjoy your WebRTC chat application! 🎉${NC}"
echo ""
