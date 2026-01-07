#!/bin/bash

# EastVsWest Local Development Setup Script
# This script helps initialize the development environment.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting EastVsWest local development setup...${NC}"

# Function to check if a command exists
check_cmd() {
    if ! command -v "$1" &> /dev/null;
 then
        return 1
    fi
    return 0
}

# 1. Check Dependencies
echo -e "\n${YELLOW}Checking dependencies...${NC}"

deps=("node" "npm" "docker" "jq")
missing_deps=()

for dep in "${deps[@]}"; do
    if check_cmd "$dep"; then
        echo -e "  ✅ $dep is installed"
    else
        echo -e "  ❌ $dep is NOT installed"
        missing_deps+=("$dep")
    fi
done

# Check for supabase separately as it can be used via npx
if check_cmd "supabase"; then
    echo -e "  ✅ supabase CLI is installed globally (will prefer local npx version if available)"
fi

# We will use npx supabase which uses the local dependency
SUPABASE_CMD="npx supabase"

if [ ${#missing_deps[@]} -ne 0 ]; then
    echo -e "\n${RED}Missing dependencies: ${missing_deps[*]}${NC}"
    echo -e "Please install them before continuing."

    if [[ " ${missing_deps[*]} " =~ " docker " ]]; then
        echo -e "Install Docker: https://www.docker.com/products/docker-desktop"
    fi
    if [[ " ${missing_deps[*]} " =~ " jq " ]]; then
        echo -e "Install jq: https://stedolan.github.io/jq/download/"
    fi
    exit 1
fi

# 2. Setup Environment Variables
echo -e "\n${YELLOW}Setting up environment variables...${NC}"
if [ ! -f .env.local ]; then
    if [ -f .env.local.example ]; then
        echo -e "  Creating .env.local from .env.local.example..."
        cp .env.local.example .env.local
        echo -e "  ✅ .env.local created"
    else
        echo -e "  ${RED}❌ .env.local.example not found. Cannot create .env.local.${NC}"
    fi
else
    echo -e "  ✅ .env.local already exists"
fi

# 3. Install NPM Dependencies
echo -e "\n${YELLOW}Installing NPM dependencies...${NC}"
npm install
echo -e "  ✅ NPM dependencies installed"

# 4. Supabase Setup
echo -e "\n${YELLOW}Checking Supabase status...${NC}"
# Use a subshell to capture output and avoid exiting if status fails
if $SUPABASE_CMD status &> /dev/null; then
    echo -e "  ✅ Supabase is already running"
else
    echo -e "  Supabase is not running."
    if [ -t 0 ]; then
        echo -en "  ${YELLOW}Would you like to start Supabase now? (y/n): ${NC}"
        read -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "  Starting Supabase (this may take a few minutes)..."
            $SUPABASE_CMD start
            echo -e "  ✅ Supabase started"
        else
            echo -e "  Skipping Supabase start. Remember to run 'npm run supabase:start' later."
        fi
    else
        echo -e "  Non-interactive shell detected. Skipping Supabase start."
        echo -e "  Run 'npm run supabase:start' to start it manually."
    fi
fi

echo -e "\n${GREEN}Setup complete!${NC}"
echo -e "To start the development server: ${YELLOW}npm run dev${NC}"
echo -e "To run tests: ${YELLOW}npm test${NC}"
echo -e "To run E2E tests: ${YELLOW}npm run test:e2e${NC}"
