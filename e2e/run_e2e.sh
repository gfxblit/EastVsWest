#!/bin/bash

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: 'jq' is not installed. It is required for parsing Supabase status."
  echo "Install it via 'brew install jq' (macOS) or 'sudo apt-get install jq' (Linux)."
  exit 1
fi

# Use local supabase if available, otherwise fallback to npx
if [ -f "./node_modules/.bin/supabase" ]; then
  SUPABASE_BIN="./node_modules/.bin/supabase"
else
  SUPABASE_BIN="npx supabase"
fi

# Fetch Supabase status in JSON format
STATUS=$($SUPABASE_BIN status -o json 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$STATUS" ]; then
  echo "Error: Could not retrieve Supabase status. Is Supabase running?"
  echo "Try running: npm run supabase:start"
  exit 1
fi

# Extract URL and ANON_KEY using jq
URL=$(echo $STATUS | jq -r '.API_URL')
KEY=$(echo $STATUS | jq -r '.ANON_KEY')

if [ -z "$URL" ] || [ "$URL" == "null" ]; then
  echo "Error: Could not retrieve SUPABASE_URL from 'supabase status'. Check if Supabase is initialized."
  exit 1
fi

echo "Running E2E tests against: $URL"

# Run tests with environment variables and --runInBand for stability
HEADLESS=true SUPABASE_URL="$URL" SUPABASE_ANON_KEY="$KEY" node --no-warnings --experimental-vm-modules node_modules/jest/bin/jest.js --config=jest.e2e.config.js --runInBand --forceExit --detectOpenHandles --silent "$@"
