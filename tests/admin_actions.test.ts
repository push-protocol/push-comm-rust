import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PushComm } from "../target/types/push_comm";
import chaiAsPromised from "chai-as-promised";
import { SEEDS, ERRORS, fundAccount } from './utils';

import { assert, expect } from "chai";


describe("push_comm_admin_setter_functions", () => {
  const provider = anchor.AnchorProvider.env(); // Get the provider for accessing the wallet
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PushComm as Program<PushComm>;

  const pushAdmin = anchor.web3.Keypair.generate(); // Generate a new pushAdmin account
  const admin_temp = anchor.web3.Keypair.generate();
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

  // After each test, 
  // 1. set back the ADMIN from admin_temp to pushAdmin
  // 2. UnPause the contract
  afterEach(async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    // Fetch the storage account to verify admin settings after each test
    const storageAccount = await program.account.pushCommStorage.fetch(storage);

    const currentAdmin = storageAccount.pushChannelAdmin;
    // Check if current admin is pushAdmin
    if (currentAdmin.toString() !== pushAdmin.publicKey.toString()) {

      // Transfer admin ownership back to pushAdmin
      await program.methods
        .transferAdminOwnership(pushAdmin.publicKey)
        .accounts({
          storage: storage,
          pushChannelAdmin: admin_temp.publicKey,
        })
        .signers([admin_temp])
        .rpc();

      // Optionally, log the transfer
      console.log(`Transferred admin ownership back to pushAdmin from ${currentAdmin.toString()}`);

      // Fetch the storage account again to confirm
      const updatedStorageAccount = await program.account.pushCommStorage.fetch(storage);
      assert.strictEqual(
        updatedStorageAccount.pushChannelAdmin.toString(),
        pushAdmin.publicKey.toString(),
        "Failed to transfer admin ownership back to pushAdmin"
      );
    }

    // Unpause the contract
    if (storageAccount.paused) {
      await program.methods
        .unpauseContract()
        .accounts({
          storage: storage,
          pushChannelAdmin: pushAdmin.publicKey,
        })
        .signers([pushAdmin])
        .rpc();

      // Optionally, log the unpause
      console.log("Unpaused the contract");

      // Fetch the storage account again to confirm
      const updatedStorageAccount = await program.account.pushCommStorage.fetch(storage);
      assert.strictEqual(updatedStorageAccount.paused, false, "Failed to unpause the contract");
    }
  });

  it("Is initialized!", async () => {

    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    const chainCluster = "devnet";
    const tx = await program.methods.initialize(
      pushAdmin.publicKey,
      chainCluster,
    ).accounts({
      storage: storage,
      signer: pushAdmin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([pushAdmin]).rpc();
    // Add your test here.
    console.log("Your transaction signature", tx);

    // Fetch the initialized account and check initial values
    const accountData = await program.account.pushCommStorage.fetch(storage);

    expect(accountData.chainCluster.toString()).to.equal(chainCluster.toString());
    expect(accountData.governance.toString()).to.eq(pushAdmin.publicKey.toString());
    expect(accountData.pushChannelAdmin.toString()).to.eq(pushAdmin.publicKey.toString());

  });

  // Admin function tests
  it("set token address by admin ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    const pushToken = anchor.web3.Keypair.generate().publicKey;

    const tx = await program.methods.setPushTokenAddress(
      pushToken
    ).accounts({
      storage: storage,
      pushChannelAdmin: pushAdmin.publicKey,
    }).signers([pushAdmin]).rpc();
    
    console.log("Your transaction signature", tx);

    const accountData = await program.account.pushCommStorage.fetch(storage);
    
    expect(accountData.pushTokenNtt.toString()).to.eq(pushToken.toString());
  });

  it("set token address by non-admin should fail ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    const pushToken = anchor.web3.Keypair.generate().publicKey;

    try {
      await program.methods.setPushTokenAddress(
        pushToken
      ).accounts({
        storage: storage,
        pushChannelAdmin: user1.publicKey,
      }).signers([user1]).rpc();
      assert.fail("The transaction should have failed but it succeeded.");

    } catch (_err) {
      assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an AnchorError");
      const err: anchor.AnchorError = _err;
      const expectedErrorMsg = ERRORS.Unauthorized;
      assert.strictEqual(err.error.errorMessage, expectedErrorMsg, `Expected error message to be "${expectedErrorMsg}" but got "${err.error.errorMessage}"`);
      
      console.log("Error number:", err.error.errorCode.number);
    }
  });

  it("set governance address by admin ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    const governance = anchor.web3.Keypair.generate().publicKey;

    const tx = await program.methods.setGovernanceAddress(
      governance
    ).accounts({
      storage: storage,
      pushChannelAdmin: pushAdmin.publicKey,
    }).signers([pushAdmin]).rpc();
    
    console.log("Your transaction signature", tx);

    const accountData = await program.account.pushCommStorage.fetch(storage);
    
    expect(accountData.governance.toString()).to.eq(governance.toString());

  });

  it("set governance address by non-admin should fail ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    const governance = anchor.web3.Keypair.generate().publicKey;

    try {
      await program.methods.setGovernanceAddress(
        governance
      ).accounts({
        storage: storage,
        pushChannelAdmin: user1.publicKey,
      }).signers([user1]).rpc();
      assert.fail("The transaction should have failed but it succeeded.");

    } catch (_err) {
      assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an AnchorError");
      const err: anchor.AnchorError = _err;
      const expectedErrorMsg = ERRORS.Unauthorized;
      assert.strictEqual(err.error.errorMessage, expectedErrorMsg, `Expected error message to be "${expectedErrorMsg}" but got "${err.error.errorMessage}"`);
      
      console.log("Error number:", err.error.errorCode.number);
    }
  });

  it("pauseable check by admin ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);

    const tx = await program.methods.pauseContract().accounts({
      storage: storage,
      pushChannelAdmin: pushAdmin.publicKey,
    }).signers([pushAdmin]).rpc();
    
    console.log("Your transaction signature", tx);

    const accountData = await program.account.pushCommStorage.fetch(storage);
    
    expect(accountData.paused).to.eq(true);

  });

  it("pauseable check by non-admin should fail ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);

    try {
      await program.methods.pauseContract().accounts({
        storage: storage,
        pushChannelAdmin: user1.publicKey,
      }).signers([user1]).rpc();
      assert.fail("The transaction should have failed but it succeeded.");

    } catch (_err) {
      assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an AnchorError");
      const err: anchor.AnchorError = _err;
      const expectedErrorMsg = ERRORS.Unauthorized;
      assert.strictEqual(err.error.errorMessage, expectedErrorMsg, `Expected error message to be "${expectedErrorMsg}" but got "${err.error.errorMessage}`);
      
      console.log("Error number:", err.error.errorCode.number);
    }
  });

  it("unpauseable check by admin ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);

    // Pause the contract
    await program.methods
    .pauseContract()
    .accounts({
      storage: storage,
      pushChannelAdmin: pushAdmin.publicKey,
    })
    .signers([pushAdmin])
    .rpc();

    const tx = await program.methods.unpauseContract().accounts({
      storage: storage,
      pushChannelAdmin: pushAdmin.publicKey,
    }).signers([pushAdmin]).rpc();
    
    console.log("Your transaction signature", tx);

    const accountData = await program.account.pushCommStorage.fetch(storage);
    
    expect(accountData.paused).to.eq(false);

  });

  it("unpauseable check by non-admin should fail ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);

    try {
      await program.methods.unpauseContract().accounts({
        storage: storage,
        pushChannelAdmin: user1.publicKey,
      }).signers([user1]).rpc();
      assert.fail("The transaction should have failed but it succeeded.");

    } catch (_err) {
      assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an AnchorError");
      const err: anchor.AnchorError = _err;
      const expectedErrorMsg = ERRORS.Unauthorized;
      assert.strictEqual(err.error.errorMessage, expectedErrorMsg, `Expected error message to be "${expectedErrorMsg}" but got "${err.error.errorMessage}`);
      
      console.log("Error number:", err.error.errorCode.number);
    }
  });

  it("transfer admin ownership by admin ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
    const tx = await program.methods.transferAdminOwnership(
      admin_temp.publicKey
    ).accounts({
      storage: storage,
      pushChannelAdmin: pushAdmin.publicKey,
    }).signers([pushAdmin]).rpc();
    
    console.log("Your transaction signature", tx);

    const accountData = await program.account.pushCommStorage.fetch(storage);
    
    expect(accountData.pushChannelAdmin.toString()).to.eq(admin_temp.publicKey.toString());

  });

  it("fails to transfer admin ownership to zero address", async () => {
    const [storage, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [SEEDS.PUSH_COMM_STORAGE],
      program.programId
    );
  
    try {
      // Attempt to transfer ownership to the zero address
      const tx = await program.methods
        .transferAdminOwnership(anchor.web3.PublicKey.default) // Zero address
        .accounts({
          storage: storage,
          pushChannelAdmin: pushAdmin.publicKey,
        })
        .signers([pushAdmin])
        .rpc();
  
      console.log("Transaction signature:", tx);
      // If the transaction does not throw, fail the test
      throw new Error("Transaction did not fail as expected");
    } catch (err) {
      // Assert that the error is the expected one
      expect(err.error.errorCode.code).to.equal("InvalidArgument");
      expect(err.error.errorCode.number).to.equal(6001); // Replace with your actual error code number
    }
  });
  

  it("transfer admin ownership by non-admin should fail ", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);

    try {
      await program.methods.transferAdminOwnership(
        admin_temp.publicKey
      ).accounts({
        storage: storage,
        pushChannelAdmin: user1.publicKey,
      }).signers([user1]).rpc();
      assert.fail("The transaction should have failed but it succeeded.");

    } catch (_err) {
      assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an AnchorError");
      const err: anchor.AnchorError = _err;
      const expectedErrorMsg = ERRORS.Unauthorized;
      assert.strictEqual(err.error.errorMessage, expectedErrorMsg, `Expected error message to be "${expectedErrorMsg}" but got "${err.error.errorMessage}`);
      
      console.log("Error number:", err.error.errorCode.number);
    }
  });

  it("transfer admin ownership by admin should fail if contract is paused", async () => {
    const [storage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);

    // Pause the contract
    await program.methods
      .pauseContract()
      .accounts({
        storage: storage,
        pushChannelAdmin: pushAdmin.publicKey,
      })
      .signers([pushAdmin])
      .rpc();

    try {
      await program.methods.transferAdminOwnership(
        admin_temp.publicKey
      ).accounts({
        storage: storage,
        pushChannelAdmin: pushAdmin.publicKey,
      }).signers([pushAdmin]).rpc();
      assert.fail("The transaction should have failed but it succeeded.");

    } catch (_err) {
      assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an AnchorError");
      const err: anchor.AnchorError = _err;
      const expectedErrorMsg = ERRORS.ContractPaused;
      assert.strictEqual(err.error.errorMessage, expectedErrorMsg, `Expected error message to be "${expectedErrorMsg}" but got "${err.error.errorMessage}`);
      
      console.log("Error number:", err.error.errorCode);

    }

  });
  
  
  
});
