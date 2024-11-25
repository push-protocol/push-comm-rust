import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PushComm } from "../target/types/push_comm";
import chaiAsPromised from "chai-as-promised";
import { SEEDS, ERRORS, fundAccount } from './utils';

import { assert, expect } from "chai";

describe("push_comm_subscription_tests", () => {
  const provider = anchor.AnchorProvider.env(); // Get the provider for accessing the wallet
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PushComm as Program<PushComm>;

  const pushAdmin = anchor.web3.Keypair.generate(); // Generate a new pushAdmin account
  const admin_temp = anchor.web3.Keypair.generate();
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
    const tx = await program.methods.initialize(
      pushAdmin.publicKey,
      chainCluster,
    ).accounts({
      storage: storage,
      signer: pushAdmin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([pushAdmin]).rpc();

    // Fetch the initialized account and check initial values
    const accountData = await program.account.pushCommStorage.fetch(storage);

    expect(accountData.chainCluster.toString()).to.equal(chainCluster.toString());
    expect(accountData.governance.toString()).to.eq(pushAdmin.publicKey.toString());
    expect(accountData.pushChannelAdmin.toString()).to.eq(pushAdmin.publicKey.toString());

  });

  /**
   * Add and Remove Delegate function test
   * 1. Channel1 should add delegate1
   * 2. Channel1 should remove delegate1
   * 3. Channel1 should add delegate1 and delegate2
   * 4. Channel1 should remove delegate1 and delegate2
   * 5. Adding a delegate again should revert an error
   * 6. Removing a delegate again should revert an error
   * 7. Adding a delegate should emit an event
   */
  describe("Delegate Addition-Removal Check", () => {
    it("Channel1 adds delegate1", async () => {
      const [delegateStroage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);

      // Initialize delegate_storage by adding delegate1
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData.isDelegate).to.eq(true);

    });

    it("Channel1 removes delegate1", async () => {
      const [delegateStroage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);

      // Initialize delegate_storage by adding delegate1
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,

        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      let delegateStorageData = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData.isDelegate).to.eq(true);

      // Remove delegate1
      await program.methods.removeDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate removal
      let delegateStorageData_after = await program.account.delegatedNotificationSenders.fetchNullable(delegateStroage);
      expect(delegateStorageData_after).to.be.null;
    });

    it("Channel1 adds delegate1 & delegate2", async () => {
      const [delegateStroage] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);
      const [delegateStroage2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate2.publicKey.toBuffer()], program.programId);

      // Initialize delegate_storage by adding delegate1
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();
    
      // Initialize delegate_storage by adding delegate2
      await program.methods.addDelegate(delegate2.publicKey).accounts({
        storage: delegateStroage2nd,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData.isDelegate).to.eq(true);

      const delegateStorageData2nd = await program.account.delegatedNotificationSenders.fetch(delegateStroage2nd);
      expect(delegateStorageData2nd.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData2nd.delegate.toString()).to.eq(delegate2.publicKey.toString());
      expect(delegateStorageData2nd.isDelegate).to.eq(true);
    });

    it("Channel1 removes both delegate1 & delegate2", async () => {
      const [delegateStroage] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);
      const [delegateStroage2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate2.publicKey.toBuffer()], program.programId);

      // Initialize delegate_storage by adding delegate1
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();
    
      // Initialize delegate_storage by adding delegate2
      await program.methods.addDelegate(delegate2.publicKey).accounts({
        storage: delegateStroage2nd,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData.isDelegate).to.eq(true);

      const delegateStorageData2nd = await program.account.delegatedNotificationSenders.fetch(delegateStroage2nd);
      expect(delegateStorageData2nd.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData2nd.delegate.toString()).to.eq(delegate2.publicKey.toString());
      expect(delegateStorageData2nd.isDelegate).to.eq(true);

      // Channel1 removes both delegate 1 and 2
      await program.methods.removeDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate removal
      let delegateStorageData_after = await program.account.delegatedNotificationSenders.fetchNullable(delegateStroage);
      expect(delegateStorageData_after).to.be.null;

      await program.methods.removeDelegate(delegate2.publicKey).accounts({
        storage: delegateStroage2nd,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      const delegateStorageData2nd_after = await program.account.delegatedNotificationSenders.fetchNullable(delegateStroage2nd);
      expect(delegateStorageData2nd_after).to.be.null;
    });

    it("Channel1 adds - removes - adds back delegate1", async () => {
      const [delegateStroage] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);

      // Initialize delegate_storage by adding delegate1
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData.isDelegate).to.eq(true);
      // Channel1 removes both delegate 1 and 2
      await program.methods.removeDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData_after = await program.account.delegatedNotificationSenders.fetchNullable(delegateStroage);
      expect(delegateStorageData_after).to.be.null;

      // Add delegate1 again
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData_after2 = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData_after2.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData_after2.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData_after2.isDelegate).to.eq(true);
    });

    it("Channel1 tries adding delegate1 twice", async () => {
      const [delegateStroage] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);

      // Initialize delegate_storage by adding delegate1
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();
    
      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData.isDelegate).to.eq(true);

      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account again to verify the delegate addition
      const delegateStorageData2 = await program.account.delegatedNotificationSenders.fetch(delegateStroage);
      expect(delegateStorageData2.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData2.delegate.toString()).to.eq(delegate1.publicKey.toString());
      expect(delegateStorageData2.isDelegate).to.eq(true);
    });

    it("Channel1 adding itself as a delegate multiple times should not fail", async () => {
      const [delegateStorage] = await anchor.web3.PublicKey.findProgramAddressSync(
        [SEEDS.DELEGATE, channel1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
        program.programId
      );

      // First attempt to add channel1 as its own delegate
      await program.methods.addDelegate(channel1.publicKey).accounts({
        storage: delegateStorage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      await program.methods.addDelegate(channel1.publicKey).accounts({
        storage: delegateStorage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      await program.methods.addDelegate(channel1.publicKey).accounts({
        storage: delegateStorage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Fetch the delegate_storage account to verify the delegate addition
      const delegateStorageData = await program.account.delegatedNotificationSenders.fetch(delegateStorage);
      expect(delegateStorageData.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.delegate.toString()).to.eq(channel1.publicKey.toString());
      expect(delegateStorageData.isDelegate).to.eq(true);
    });
    

    it("Channel1 tries removing delegate1 twice", async () => {
      const [delegateStroage] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);

      // Initialize delegate_storage by adding delegate1
      await program.methods.addDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

      // Remove delegate1
      await program.methods.removeDelegate(delegate1.publicKey).accounts({
        storage: delegateStroage,
        signer: channel1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([channel1]).rpc();

       // Fetch the delegate_storage account to verify the delegate addition
       const delegateStorageData_after = await program.account.delegatedNotificationSenders.fetchNullable(delegateStroage);
       expect(delegateStorageData_after).to.be.null;

      try {
        // Remove delegate1 again
        await program.methods.removeDelegate(delegate1.publicKey).accounts({
          storage: delegateStroage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();

        assert.fail("Removing a delegate twice should revert an error");
      } catch (_err) {
        assert.isTrue(_err instanceof anchor.AnchorError, "Error is not an Anchor Error");
      }
    });

    it("Adding a delegate should EMIT accurate event", async () => {
      const [delegateStorage] = await anchor.web3.PublicKey.findProgramAddressSync(
        [SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()],
        program.programId
      );
    
      let addDelegateEvent: any = null;
    
      // Add event listener and log to confirm it's active
      const listener = await program.addEventListener('AddDelegate', (event, slot) => {
        addDelegateEvent = event;
      });
    
      // Call the addDelegate method
      try {
        await program.methods.addDelegate(delegate1.publicKey)
          .accounts({
            storage: delegateStorage,
            signer: channel1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([channel1])
          .rpc();
      } catch (err) {
        console.error("Transaction failed:", err); // Debug transaction failures
      }
    
      // Wait for event and clean up listener
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await program.removeEventListener(listener);
    
      // Assertions
      expect(addDelegateEvent).to.not.be.null;
      expect(addDelegateEvent.channel.toString()).to.eq(channel1.publicKey.toString());
      expect(addDelegateEvent.delegate.toString()).to.eq(delegate1.publicKey.toString());
    });

    it("Removing a delegate should EMIT accurate event", async () => {
      const [delegateStroage] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);

        // Initialize delegate_storage by adding delegate1
        await program.methods.addDelegate(delegate1.publicKey).accounts({
          storage: delegateStroage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();
       let removeDelegateEvent: any = null;

       const listner = program.addEventListener('RemoveDelegate', (event, slot) => {
        removeDelegateEvent = event;  
       })
        // Removing delegate1 
        await program.methods.removeDelegate(delegate1.publicKey).accounts({
          storage: delegateStroage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,}).signers([channel1]).rpc();

         await new Promise((resolve) => setTimeout(resolve, 1000));
         await program.removeEventListener(listner);

         expect(removeDelegateEvent).to.not.be.null;
         expect(removeDelegateEvent.channel.toString()).to.eq(channel1.publicKey.toString());
         expect(removeDelegateEvent.delegate.toString()).to.eq(delegate1.publicKey.toString());

    });
  
  });

  /**
   * Send Notification Function Tests
   * 1. Should emit Notification event
   * 2. Only allowed delegates should emit the event
   * 3. Emit should not work if the delegate address is unauthorized
   * 4. Emit shouldn't work if channel1 has not added itself as a delegate
   */


  describe("Send Notifications Tests", () => {

      it("Notification to USER1 by delegate1 for Channel 1", async () => {
        const [delegateStroage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()], program.programId);

                // Initialize delegate_storage by adding delegate
        await program.methods.addDelegate(delegate1.publicKey)
        .accounts({
          storage: delegateStroage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([channel1])
        .rpc();

        // Prepare notification data
        const notificationIdentity = Buffer.from("Test notification from delegate");
        
        let notificationEvent: any = null;

        const listner = program.addEventListener('SendNotification', (event, slot) => {
          notificationEvent = event;  
        })
        // Channel1 Sends notification to USER1
        program.methods.sendNotification(channel1.publicKey, user1.publicKey, notificationIdentity)
          .accounts({
            delegateStorage: delegateStroage,
            signer: delegate1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })

          .signers([delegate1])
          .rpc();

          await new Promise((resolve) => setTimeout(resolve, 1000));
          await program.removeEventListener(listner);

          //expect(notificationEvent).to.not.be.null;
          expect(notificationEvent.recipient.toString()).to.eq(user1.publicKey.toString());
          expect(notificationEvent.channel.toString()).to.eq(channel1.publicKey.toString());
          expect(notificationEvent.message.toString()).to.eq(notificationIdentity.toString());

      });

      it("Notification to USER1 if Channel1 adds itself as a delegate", async () => {
        const [delegateStroage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);

        // Initialize delegate_storage by adding delegate1
        await program.methods.addDelegate(channel1.publicKey).accounts({
          storage: delegateStroage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();

        // Prepare notification data
        const notificationIdentity = Buffer.from("Test notification from delegate");
        
        let notificationEvent: any = null;

        const listner = program.addEventListener('SendNotification', (event, slot) => {
          notificationEvent = event;  
        })
        // Channel1 Sends notification to USER1
        program.methods.sendNotification(channel1.publicKey, user1.publicKey, notificationIdentity)
          .accounts({
            delegateStorage: delegateStroage,
            signer: channel1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })

          .signers([channel1])
          .rpc();

          await new Promise((resolve) => setTimeout(resolve, 1000));
          await program.removeEventListener(listner);

          //expect(notificationEvent).to.not.be.null;
          expect(notificationEvent.recipient.toString()).to.eq(user1.publicKey.toString());
          expect(notificationEvent.channel.toString()).to.eq(channel1.publicKey.toString());
          expect(notificationEvent.message.toString()).to.eq(notificationIdentity.toString());
      })

      it("Notification to USER1 by Channel1 for Channel 1", async () => {
        const [delegateStroage, bump] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.DELEGATE, channel1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);

        // Prepare notification data
        const notificationIdentity = Buffer.from("Test notification from delegate");
        
        let notificationEvent: any = null;

        const listner = program.addEventListener('SendNotification', (event, slot) => {
          notificationEvent = event;  
        })
        // Channel1 Sends notification to USER1
        program.methods.sendNotification(channel1.publicKey, user1.publicKey, notificationIdentity)
          .accounts({
            delegateStorage: delegateStroage,
            signer: channel1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })

          .signers([channel1])
          .rpc();

          await new Promise((resolve) => setTimeout(resolve, 1000));
          await program.removeEventListener(listner);

          //expect(notificationEvent).to.not.be.null;
          expect(notificationEvent.recipient.toString()).to.eq(user1.publicKey.toString());
          expect(notificationEvent.channel.toString()).to.eq(channel1.publicKey.toString());
          expect(notificationEvent.message.toString()).to.eq(notificationIdentity.toString());

      });

      it("Emit should not work if delegate1 is authorized for channel1 but delegate2 calls sendNotification", async () => {
        const [delegateStorage] = await anchor.web3.PublicKey.findProgramAddressSync(
          [SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()],
          program.programId
        );

        // Authorize delegate1 for channel1
        await program.methods.addDelegate(delegate1.publicKey).accounts({
          storage: delegateStorage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();
      
        let sendNotificationEvent: any = null;
      
        // Listen for the SendNotification event
        const listener = program.addEventListener('SendNotification', (event, slot) => {
          sendNotificationEvent = event;
        });
      
        // Attempt to send a notification using delegate2 instead of delegate1
        const notificationMessage = Buffer.from("Attempted notification from unauthorized delegate");
        await program.methods.sendNotification(channel1.publicKey, user1.publicKey, notificationMessage).accounts({
          delegateStorage: delegateStorage,
          signer: delegate2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([delegate2]).rpc().catch(err => {
          // Ignoring the error since we are testing failure case
        });
      
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await program.removeEventListener(listener);
      
        // Assert that no SendNotification event was emitted
        expect(sendNotificationEvent).to.be.null;
      });

      it("Send Notification Emit should work if channel1 has not added itself as a delegate first", async () => {
        const [delegateStorage] = await anchor.web3.PublicKey.findProgramAddressSync(
          [SEEDS.DELEGATE, channel1.publicKey.toBuffer(), channel1.publicKey.toBuffer()],
          program.programId
        );
      
        let sendNotificationEvent: any = null;
      
        // Listen for the SendNotification event
        const listener = program.addEventListener('SendNotification', (event, slot) => {
          sendNotificationEvent = event;
        });
      
        // Attempt to send a notification using channel1 without adding itself as a delegate
        const notificationMessage = Buffer.from("Notification attempt without delegate authorization");
        await program.methods.sendNotification(channel1.publicKey, user1.publicKey, notificationMessage).accounts({
          delegateStorage: delegateStorage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc().catch(err => {
          // Ignoring the error since we are testing failure case
        });
      
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await program.removeEventListener(listener);
      
        // Assert that SendNotification event was emitted
        expect(sendNotificationEvent.recipient.toString()).to.eq(user1.publicKey.toString());
        expect(sendNotificationEvent.channel.toString()).to.eq(channel1.publicKey.toString());
        expect(sendNotificationEvent.message.toString()).to.eq(notificationMessage.toString());
      });

      it("Attempt to send notification after delegate is removed should fail", async () => {
        const [delegateStorage] = await anchor.web3.PublicKey.findProgramAddressSync(
          [SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()],
          program.programId
        );

        // Initialize delegate_storage by adding delegate1
        await program.methods.addDelegate(delegate1.publicKey).accounts({
          storage: delegateStorage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();
      
        // Remove delegate1
        await program.methods.removeDelegate(delegate1.publicKey).accounts({
          storage: delegateStorage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();
      
        // Attempt to send a notification using the removed delegate
        const notificationIdentity = Buffer.from("Notification after removal");
      
        let sendNotificationEvent: any = null;
      
        // Listen for the SendNotification event
        const listener = program.addEventListener('SendNotification', (event, slot) => {
          sendNotificationEvent = event;
        });
      
        // Attempt to send a notification using channel1 without adding itself as a delegate
        const notificationMessage = Buffer.from("Notification attempt without delegate authorization");
        await program.methods.sendNotification(channel1.publicKey, user1.publicKey, notificationMessage).accounts({
          delegateStorage: delegateStorage,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc().catch(err => {
          // Ignoring the error since we are testing failure case
        });
      
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await program.removeEventListener(listener);
      
        // Assert that no SendNotification event was emitted
        expect(sendNotificationEvent).to.be.null;
      });

      it("Multiple delegates for one channel should be able to send notifications", async () => {
        const [delegateStorage1] = await anchor.web3.PublicKey.findProgramAddressSync(
          [SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate1.publicKey.toBuffer()],
          program.programId
        );
        const [delegateStorage2] = await anchor.web3.PublicKey.findProgramAddressSync(
          [SEEDS.DELEGATE, channel1.publicKey.toBuffer(), delegate2.publicKey.toBuffer()],
          program.programId
        );

        // Step 1: Add delegate1 and delegate2 for channel1
        await program.methods.addDelegate(delegate1.publicKey).accounts({
          storage: delegateStorage1,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();
      
        await program.methods.addDelegate(delegate2.publicKey).accounts({
          storage: delegateStorage2,
          signer: channel1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([channel1]).rpc();
      
        // Step 2: Prepare notification data
        const notificationIdentity = Buffer.from("Test notification from delegate");
      
        // Event listener for SendNotification
        let notificationEvent: any = null;
        const listener = program.addEventListener('SendNotification', (event, slot) => {
          notificationEvent = event;
        });
      
        // Step 3: Delegate1 sends a notification
        await program.methods.sendNotification(channel1.publicKey, user1.publicKey, notificationIdentity)
          .accounts({
            delegateStorage: delegateStorage1,
            signer: delegate1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([delegate1])
          .rpc();
      
        // Allow some time for event to be emitted
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await program.removeEventListener(listener);
      
        // Step 4: Assertions for Delegate1
        expect(notificationEvent).to.not.be.null;
        expect(notificationEvent.recipient.toString()).to.eq(user1.publicKey.toString());
        expect(notificationEvent.channel.toString()).to.eq(channel1.publicKey.toString());
        expect(notificationEvent.message.toString()).to.eq(notificationIdentity.toString());
      
        // Step 5: Reset the event listener for the next delegate
        notificationEvent = null;
        const secondListener = program.addEventListener('SendNotification', (event, slot) => {
          notificationEvent = event;
        });
      
        // Step 6: Delegate2 sends a notification
        await program.methods.sendNotification(channel1.publicKey, user2.publicKey, notificationIdentity)
          .accounts({
            delegateStorage: delegateStorage2,
            signer: delegate2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([delegate2])
          .rpc();
      
        // Allow some time for event to be emitted
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await program.removeEventListener(secondListener);
      
        // Step 7: Assertions for Delegate2
        expect(notificationEvent).to.not.be.null;
        expect(notificationEvent.recipient.toString()).to.eq(user2.publicKey.toString());
        expect(notificationEvent.channel.toString()).to.eq(channel1.publicKey.toString());
        expect(notificationEvent.message.toString()).to.eq(notificationIdentity.toString());
      });
      });

  });
