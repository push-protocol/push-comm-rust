#!/bin/bash

# Load environment variables from .env file
source .env

# Check for necessary environment variables
if [[ -z "$NETWORK" || -z "$ANCHOR_WALLET" || -z "$PROGRAM_ID" ]]; then
  echo "Please ensure NETWORK, ANCHOR_WALLET, and PROGRAM_ID are set in the .env file."
  exit 1
fi

# Set the provider URL based on the selected network
case $NETWORK in
  localnet)
    export ANCHOR_PROVIDER_URL="$PROVIDER_LOCALNET"
    ;;
  devnet)
    export ANCHOR_PROVIDER_URL="$PROVIDER_DEVNET"
    ;;
  mainnet-beta)
    export ANCHOR_PROVIDER_URL="$PROVIDER_MAINNET"
    ;;
  *)
    echo "Invalid NETWORK specified. Use 'localnet', 'devnet', or 'mainnet'."
    exit 1
    ;;
esac

# Build the program
echo "Building the program..."
anchor build

# Upgrade the program with the correct wallet and provider URL
echo "Upgrading the program on $NETWORK..."
anchor upgrade target/deploy/push_comm.so --program-id "$PROGRAM_ID" --provider.cluster "$ANCHOR_PROVIDER_URL" --provider.wallet "$ANCHOR_WALLET"

echo "Program upgraded successfully!"
