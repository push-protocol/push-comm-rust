#!/bin/bash

# Load environment variables from .env file
source .env

# Check for necessary environment variables
if [[ -z "$NETWORK" || -z "$ANCHOR_WALLET" ]]; then
  echo "Please ensure NETWORK and ANCHOR_WALLET are set in the .env file."
  exit 1
fi

# Set the provider URL based on the selected network
case $NETWORK in
  localnet)
    export ANCHOR_PROVIDER_URL="$PROVIDER_LOCALNET"
    ;;
  devnet)
    export ANCHOR_PROVIDER_URL="$PROVIDER_DEVNET"
    echo "Requesting airdrop for Devnet..."
    solana airdrop 0.2 --url "$ANCHOR_PROVIDER_URL"
    ;;
  mainnet-beta)
    export ANCHOR_PROVIDER_URL="$PROVIDER_MAINNET"
    ;;
  *)
    echo "Invalid NETWORK specified. Use 'localnet', 'devnet', or 'mainnet-beta'."
    exit 1
    ;;
esac

# Set the anchor wallet path
export ANCHOR_WALLET="$ANCHOR_WALLET"

# Build the program
echo "Building the program..."
anchor build

# Deploy the program with the correct wallet and provider URL
echo "Deploying a new program..."
anchor deploy --provider.cluster "$ANCHOR_PROVIDER_URL" --provider.wallet "$ANCHOR_WALLET"

# Output the new program ID
NEW_PROGRAM_ID=$(anchor keys list | grep "Program Id:" | awk '{print $3}')
echo "Program deployed successfully with ID: $NEW_PROGRAM_ID"
