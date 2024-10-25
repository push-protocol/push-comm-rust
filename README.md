# Push Communicator <Non-EVM>

This repo includes the Solana-Rust implementation of the Push Communicator contract.

**Note: Currently in WIP**

## Prerequisites

- Make sure you have the latest version of [Rust](https://www.rust-lang.org/tools/install) and [Anchor](https://project-serum.github.io/anchor/getting-started/introduction.html) installed.
- Set up your Solana wallet and ensure you have the necessary funds for deployment on your chosen network (localnet, devnet, or mainnet).

## Environment Setup

1. **Create and Configure the `.env` File**

   Copy the example environment file to create your own:

   ```bash
   cp .env.example .env
    ```

    Open .env in a text editor and update the following values:
    ```bash
    # Choose your network: localnet, devnet, or mainnet
    NETWORK=localnet  # Change this to your desired environment

    # Path to your wallet
    ANCHOR_WALLET=/path/to/your/solana/id.json

    # Program ID (only needed for upgrades)
    PROGRAM_ID=YourProgramID  # Replace with your actual program ID

    # Provider URLs
    PROVIDER_LOCALNET=http://localhost:8899
    PROVIDER_DEVNET=https://api.devnet.solana.com
    PROVIDER_MAINNET=https://api.mainnet-beta.solana.com
    ```

    Make sure to set the correct path for ANCHOR_WALLET and provide your actual PROGRAM_ID if you're upgrading an existing program.

## Deployment Instructions

1. **Deploying the Program**

    Use the provided deployment script to build and deploy the Push Communicator program. This script will automatically use the values from your .env file for the selected network and wallet:

    ```bash
    bash scripts/deploy.sh
    ```

    The script will perform the following actions:

    Build the program.
    1. Deploy it to the specified network using the appropriate provider URL and wallet.
    2. After deployment, the program ID will be displayed.

## Upgrade Instructions

1. **Upgrading the Program**

    If you need to upgrade an existing program, use the upgrade script. This script will also use the values from your .env file:

    ```bash
    bash scripts/upgrade.sh
    ```

    The upgrade process will:

    1. Build the program.
    2. Upgrade the existing program using the specified PROGRAM_ID, provider URL, and wallet from the .env file.
    
    A success message will confirm the upgrade.

## Running on Localnet
For **localnet**, ensure to run the Solana test validator in a separate terminal:

    ```bash
    solana-test-validator
    ```

This will start a local Solana cluster that your deployment scripts can interact with.