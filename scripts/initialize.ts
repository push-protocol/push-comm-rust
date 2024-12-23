import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PushComm } from "../target/types/push_comm";
import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Check for necessary environment variables
if (!process.env.NETWORK || !process.env.ANCHOR_WALLET) {
  console.error("Please ensure NETWORK and ANCHOR_WALLET are set in the .env file.");
  process.exit(1);
}

// Set the provider URL based on the selected network
let anchorProviderUrl: string;

switch (process.env.NETWORK) {
  case 'localnet':
    anchorProviderUrl = process.env.PROVIDER_LOCALNET!;
    break;
  case 'devnet':
    anchorProviderUrl = process.env.PROVIDER_DEVNET!;
    break;
  case 'mainnet-beta':
    anchorProviderUrl = process.env.PROVIDER_MAINNET!;
    break;
  default:
    console.error("Invalid NETWORK specified. Use 'localnet', 'devnet', or 'mainnet-beta'.");
    process.exit(1);
}

// Constants for the program
const SEEDS = {
  PUSH_COMM_STORAGE: Buffer.from("push_comm_storage"), // Replace with actual seed if different
};

// Resolve paths and load keypairs
const programWalletPath = path.resolve(__dirname, "../accounts/program-keypair.json");
const programWalletKeypair = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(programWalletPath, "utf8")))
);

// Use the wallet specified in ANCHOR_WALLET for pushAdmin
const anchorWalletPath = process.env.ANCHOR_WALLET;
if (!anchorWalletPath) {
  throw new Error("ANCHOR_WALLET environment variable is not set.");
}

const anchorWalletKeypair = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(anchorWalletPath, "utf8")))
);

// INITIALIZE PARAMS
const chainCluster = process.env.NETWORK;
const pushAdminPubKey = anchorWalletKeypair.publicKey; // UPDATE at the time of initialization

(async () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.local(anchorProviderUrl);
  anchor.setProvider(provider);

  const program = anchor.workspace.PushComm as Program<PushComm>;

  // Derive the PDA for the storage account
  const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync(
    [SEEDS.PUSH_COMM_STORAGE],
    program.programId
  );

  // Call the `initialize` method
  try {
    const tx = await program.methods
      .initialize(pushAdminPubKey, chainCluster)
      .accounts([
        { pubkey: storage, isSigner: false, isWritable: true },
        { pubkey: anchorWalletKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: programWalletKeypair.publicKey, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SystemProgram.programId, isSigner: false, isWritable: false },
      ])
      .signers([anchorWalletKeypair, programWalletKeypair])
      .rpc();

    console.log("Transaction signature:", tx);

    // Fetch and validate the initialized account data
    const accountData = await program.account.pushCommStorage.fetch(storage);

    console.log("Initialized account data:", accountData);

    // Validate initial values
    expect(accountData.chainCluster).to.equal(chainCluster);
    expect(accountData.governance.toString()).to.equal(pushAdminPubKey.toString());
    expect(accountData.pushChannelAdmin.toString()).to.equal(pushAdminPubKey.toString());

    console.log("Initialization successful!");
  } catch (error) {
    console.error("Error during initialization:", error);
  }
})();
