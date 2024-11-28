import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PushComm } from "../target/types/push_comm";
import { SEEDS, ERRORS, fundAccount } from './utils';

import { assert, expect } from "chai";
const fs = require('fs');
const path = require('path');

describe("push_comm_subscription_tests", () => {
  const provider = anchor.AnchorProvider.env(); // Get the provider for accessing the wallet
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PushComm as Program<PushComm>;

  const pushAdmin = anchor.web3.Keypair.generate(); // Generate a new pushAdmin account
  const admin_temp = anchor.web3.Keypair.generate();
  const MAX_NOTIF_SETTINGS_LENGTH = 100; // Adjust as needed

  let user1: anchor.web3.Keypair;
  let user2: anchor.web3.Keypair;
  let user3: anchor.web3.Keypair;
  let channel1: anchor.web3.Keypair;
  let channel2: anchor.web3.Keypair;
  let channel3: anchor.web3.Keypair;
  let delegate1: anchor.web3.Keypair;
  let delegate2: anchor.web3.Keypair;


  async function getCurrentBlockNumber(connection: anchor.web3.Connection): Promise<number> {
    const slot = await connection.getSlot();
    return slot;
  }

  beforeEach(async () => {
    user1 = anchor.web3.Keypair.generate();
    user2 = anchor.web3.Keypair.generate();
    user3 = anchor.web3.Keypair.generate();

    channel1 = anchor.web3.Keypair.generate();
    channel2 = anchor.web3.Keypair.generate();
    channel3 = anchor.web3.Keypair.generate();

    delegate1 = anchor.web3.Keypair.generate();
    delegate2 = anchor.web3.Keypair.generate();
    // Fund all accounts at once
    await Promise.all([
      fundAccount(provider.connection, pushAdmin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user1.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user3.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),

      fundAccount(provider.connection, channel1.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, channel2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, channel3.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      
      fundAccount(provider.connection, delegate1.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, delegate2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
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
    const programWalletPath = path.resolve(__dirname, "../accounts/program-keypair.json");
    const programWalletKeypair = anchor.web3.Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(programWalletPath, 'utf8')))
    );
    const tx = await program.methods.initialize(
      pushAdmin.publicKey,
      chainCluster,
    ).accounts({
      storage: storage,
      signer: pushAdmin.publicKey,
      program: programWalletKeypair.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([pushAdmin, programWalletKeypair]).rpc();

    // Fetch the initialized account and check initial values
    const accountData = await program.account.pushCommStorage.fetch(storage);

    expect(accountData.chainCluster.toString()).to.equal(chainCluster.toString());
    expect(accountData.governance.toString()).to.eq(pushAdmin.publicKey.toString());
    expect(accountData.pushChannelAdmin.toString()).to.eq(pushAdmin.publicKey.toString());

  });

  /**
   * Notification Settings Function Tests
   * 1. Should emit UserNotificationSettingsAdded event
   * 2. Should update states as expected
   * 3. Should only allow MAX_LENGTH for notif_setting string
   * 4. The caller must be subscribed to the channel to add notification settings
   */


  describe("Send Notifications Tests", () => {

        it("Notf settings set-up should emit an event", async () => {
          const [storage] = await anchor.web3.PublicKey.findProgramAddressSync(
            [SEEDS.USER_NOTIF_SETTINGS, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
            program.programId
          );
          const [subscription] = await anchor.web3.PublicKey.findProgramAddressSync(
              [SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
              program.programId
              );

              const [storageComm, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
              const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
          
          
          // Subscribe user1
          const tx = await program.methods.subscribe(channel1.publicKey).accounts({
            storage: userStorageAccount,
            subscription: subscription,
            channel: channel1.publicKey,
            commStorage: storageComm,
            signer: user1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

          // Notif Settings
          const notifId = new anchor.BN(1);
          const notifSettings = "3+1-0+2-0+3-1+4-98";
          const notifSettingsEmittedVal = "1+3+1-0+2-0+3-1+4-98";
        
          let notificationSettingEvent: any = null;
        
          // Listen for the SendNotification event
          const listener = program.addEventListener('userNotificationSettingsAdded', (event, slot) => {
            //console.log('Event Emitted:', event);
    
            notificationSettingEvent = event;
          });
        
          // Attempt to send a notification using delegate2 instead of delegate1
          await program.methods.setUserNotificationSettings(
              channel1.publicKey,
              notifId,
              notifSettings
          ).accounts({
              storage: storage,
              subscription: subscription,
              signer: user1.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user1]).rpc();
        
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await program.removeEventListener(listener);
        
          //Assert that no SendNotification event was emitted
          expect(notificationSettingEvent).to.not.be.null;
          expect(notificationSettingEvent.channel.toString()).to.eq(channel1.publicKey.toString());
          expect(notificationSettingEvent.user.toString()).to.eq(user1.publicKey.toString());
          expect(notificationSettingEvent.notifId.toString()).to.eq(notifId.toString());
          expect(notificationSettingEvent.notifSettings).to.eq(notifSettingsEmittedVal);
        });

        it("Notf settings set-up should update the state adequately", async () => {
          const [storage] = await anchor.web3.PublicKey.findProgramAddressSync(
            [SEEDS.USER_NOTIF_SETTINGS, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
            program.programId
          );
          const [subscription] = await anchor.web3.PublicKey.findProgramAddressSync(
              [SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
              program.programId
              );

              const [storageComm, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
              const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
          
          
          // Subscribe user1
          const tx = await program.methods.subscribe(channel1.publicKey).accounts({
            storage: userStorageAccount,
            subscription: subscription,
            channel: channel1.publicKey,
            commStorage: storageComm,
            signer: user1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

          // Notif Settings
          const notifId = new anchor.BN(1);
          const notifSettings = "3+1-0+2-0+3-1+4-98";
          const notifSettingsEmittedVal = "1+3+1-0+2-0+3-1+4-98";
        
          // Attempt to send a notification using delegate2 instead of delegate1
          await program.methods.setUserNotificationSettings(
              channel1.publicKey,
              notifId,
              notifSettings
          ).accounts({
              storage: storage,
              subscription: subscription,
              signer: user1.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user1]).rpc();

          const settingData = await program.account.userNotificationSettings.fetch(storage);
          expect(settingData.notifSettings).to.eq(`${notifId}+${notifSettings}`);

        });

        it("Should update notif_settings if invoked again", async () => {
          const [storage] = await anchor.web3.PublicKey.findProgramAddressSync(
            [SEEDS.USER_NOTIF_SETTINGS, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
            program.programId
          );
          const [subscription] = await anchor.web3.PublicKey.findProgramAddressSync(
              [SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
              program.programId
              );

              const [storageComm, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
              const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
          
          
          // Subscribe user1
          const tx = await program.methods.subscribe(channel1.publicKey).accounts({
            storage: userStorageAccount,
            subscription: subscription,
            channel: channel1.publicKey,
            commStorage: storageComm,
            signer: user1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

          // Notif Settings 1
          const notifId1 = new anchor.BN(1);
          const notifSettings1 = "3+1-0+2-0+3-1+4-98";
        
          // Attempt to send a notification using delegate2 instead of delegate1
          await program.methods.setUserNotificationSettings(
              channel1.publicKey,
              notifId1,
              notifSettings1
          ).accounts({
              storage: storage,
              subscription: subscription,
              signer: user1.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user1]).rpc();

          const settingData1 = await program.account.userNotificationSettings.fetch(storage);
          expect(settingData1.notifSettings).to.eq(`${notifId1}+${notifSettings1}`);


          // Notif Settings 1
          const notifId2 = new anchor.BN(2);
          const notifSettings2 = "3+1-0+2-0+3-1+4-97";
        
          // Attempt to send a notification using delegate2 instead of delegate1
          await program.methods.setUserNotificationSettings(
              channel1.publicKey,
              notifId2,
              notifSettings2
          ).accounts({
              storage: storage,
              subscription: subscription,
              signer: user1.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user1]).rpc();

          const settingData2 = await program.account.userNotificationSettings.fetch(storage);
          expect(settingData2.notifSettings).to.eq(`${notifId2}+${notifSettings2}`);
        });

        it("Should fail if notif_settings string exceeds MAX_NOTIF_SETTINGS_LENGTH", async () => {
          // Derive necessary accounts
          const [storage] = await anchor.web3.PublicKey.findProgramAddressSync(
            [SEEDS.USER_NOTIF_SETTINGS, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
            program.programId
          );
          const [subscription] = await anchor.web3.PublicKey.findProgramAddressSync(
            [SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
            program.programId
          );
          const [storageComm] = await anchor.web3.PublicKey.findProgramAddressSync(
            [SEEDS.PUSH_COMM_STORAGE],
            program.programId
          );
          const [userStorageAccount] = await anchor.web3.PublicKey.findProgramAddressSync(
            [SEEDS.USER_STORAGE, user1.publicKey.toBuffer()],
            program.programId
          );
        
          // Ensure that the user is subscribed before setting notification settings
          await program.methods.subscribe(channel1.publicKey).accounts({
            storage: userStorageAccount,
            subscription: subscription,
            channel: channel1.publicKey,
            commStorage: storageComm,
            signer: user1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user1]).rpc();
        
          // Set an excessively long notification settings string
          const notifId = new anchor.BN(1);
          const longNotifSettings = "a".repeat(MAX_NOTIF_SETTINGS_LENGTH + 1);
        
          try {
            await program.methods.setUserNotificationSettings(
              channel1.publicKey,
              notifId,
              longNotifSettings
            ).accounts({
              storage: storage,
              subscription: subscription,
              signer: user1.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
            }).signers([user1]).rpc();
        
            assert.fail("Expected error due to exceeding MAX_NOTIF_SETTINGS_LENGTH but transaction succeeded");
          } catch (_err) {
            // Check if the error is an AnchorError and if the error message matches
            assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an Anchor Error");
            const err: anchor.AnchorError = _err;
        
            const expectedErrorMsg = ERRORS.InvalidArgument; // Make sure ERRORS.InvalidArgument is correctly set
            assert.strictEqual(
              err.error.errorMessage,
              expectedErrorMsg,
              `Error message should be: ${expectedErrorMsg}, but got: ${err.error.errorMessage}`
            );
          }
        });
      
    });

  });