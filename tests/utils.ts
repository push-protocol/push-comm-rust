import * as anchor from "@coral-xyz/anchor";

import { expect } from "chai";
// SEEDS for TESTS
export const SEEDS = {
    PUSH_COMM_STORAGE: Buffer.from("push_comm_storage_v3"),
    USER_STORAGE: Buffer.from("user_storage"),
    SUBSCRIPTION: Buffer.from("is_subscribed"),
    DELEGATE : Buffer.from("delegate"),
    USER_NOTIF_SETTINGS: Buffer.from("user_notif_settings"),
    // ... other seeds
  };

  // ERROR for TESTS
  // tests/utils/errors.ts

export enum ERRORS {
  Unauthorized = "Unauthorized access",
  InvalidArgument = "Invalid argument provided",
  AlreadyPaused = "Program is already paused",
  NotPaused = "Program is not paused",
  ContractPaused = "Contract is Paused",
  InvalidSignature = "Invalid Signature Parameters",
  AlreadySubscribed = "Already Subscribed to this channel",
  NotSubscribed = "Not Subscribed to this channel",
  Underflow = "Underflow Error",
  Overflow = "Overflow Error",
}

  export async function fundAccount(connection: anchor.web3.Connection, account: anchor.web3.PublicKey, amount: number) {
    const airdropSignature = await connection.requestAirdrop(
      account,
      amount
    );
    await connection.confirmTransaction(airdropSignature, "confirmed");
  }