import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PushComm } from "../target/types/push_comm";
import { SEEDS } from './utils';

import { expect } from "chai";


describe("push_comm", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PushComm as Program<PushComm>;
  const pushAdmin = anchor.web3.Keypair.generate(); // Generate a new pushAdmin account
  // Seeds

  it("Is initialized!", async () => {
    const provider = anchor.AnchorProvider.env(); // Get the provider for accessing the wallet

    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    // Funding the pushAdmin account
    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL; // 10 SOL
    const airdropSignature = await provider.connection.requestAirdrop(
      pushAdmin.publicKey,
      airdropAmount
    );
    await provider.connection.confirmTransaction(airdropSignature, "confirmed");

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
});
