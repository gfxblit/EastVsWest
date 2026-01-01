#!/bin/bash

# Fetch Supabase status in JSON format
STATUS=$(npx supabase status -o json)

# Extract URL and ANON_KEY using jq
URL=$(echo $STATUS | jq -r '.API_URL')
KEY=$(echo $STATUS | jq -r '.ANON_KEY')

if [ -z "$URL" ] || [ "$URL" == "null" ]; then
  echo "Error: Could not retrieve SUPABASE_URL. Is Supabase running?"
  exit 1
fi

echo "Running E2E tests against: $URL"

# Run tests with environment variables and --runInBand for stability
SUPABASE_URL="$URL" SUPABASE_ANON_KEY="$KEY" node --experimental-vm-modules node_modules/jest/bin/jest.js --config=jest.e2e.config.js --runInBand "$@"
