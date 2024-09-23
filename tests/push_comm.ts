import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PushComm } from "../target/types/push_comm";
import { SEEDS, fundAccount } from './utils';

import { expect } from "chai";


describe("push_comm", () => {
  const provider = anchor.AnchorProvider.env(); // Get the provider for accessing the wallet
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PushComm as Program<PushComm>;
  const pushAdmin = anchor.web3.Keypair.generate(); // Generate a new pushAdmin account
  let user1 =  anchor.web3.Keypair.generate();
  let user2 = anchor.web3.Keypair.generate();

  before(async () => {
    // Fund all accounts at once
    await Promise.all([
      fundAccount(provider.connection, pushAdmin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user1.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
    ]);
  });

  it("Is initialized!", async () => {

    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    const chainId = new anchor.BN(1);
    const tx = await program.methods.initialize(
      pushAdmin.publicKey,
      chainId,
    ).accounts({
      storage: storage,
      signer: pushAdmin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([pushAdmin]).rpc();
    // Add your test here.
    console.log("Your transaction signature", tx);

    // Fetch the initialized account and check initial values
    const accountData = await program.account.pushCommStorageV3.fetch(storage);

    expect(accountData.chainId.toString()).to.equal(chainId.toString());
    expect(accountData.governance.toString()).to.eq(pushAdmin.publicKey.toString());
    expect(accountData.pushChannelAdmin.toString()).to.eq(pushAdmin.publicKey.toString());

  });

  // // Admin function tests
  // it("set core address", async () => {

  // });


});
