#!/bin/bash

# Set environment variables if needed
# export PI_MCP_API_KEY="sk-ant-..."
# export PI_MCP_PROVIDER="anthropic"
# export PI_MCP_MODEL="claude-sonnet-4-20250514"

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Run the compiled JavaScript file for npm packages OR TypeScript for local development
if [ -f "dist/index.js" ]; then
    node dist/index.js
elif [ -f "src/index.ts" ] && command -v tsx >/dev/null 2>&1; then
    npx tsx src/index.ts
else
    echo "Error: Neither dist/index.js nor src/index.ts found"
    exit 1
fi
