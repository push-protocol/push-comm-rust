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
    // Fund all accounts at once
    await Promise.all([
      fundAccount(provider.connection, pushAdmin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user1.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, user3.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, channel1.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, channel2.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
      fundAccount(provider.connection, channel3.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL),
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
   * Subscribe Function Tests
   * 1. Should call & update add_user()
   * 2. Should not subscribe twice
   * 3. Should increase user count
   * 4. Should update user's subscription status
   * 5. Should emit Subscribe event
   * 6. A user should subscribe to multiple channels - State updates should work accordingly
   */


  describe("Subscription Basic Checks", () => {
      it("Should subscribe user1 & update states accurately", async () => {
        const [storageAccount, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
        const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
        const [subscriptionAccount, bump3rd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
          
        const beforeBlockNumber = await getCurrentBlockNumber(program.provider.connection);

        // Subscribe user1
          const tx = await program.methods.subscribe(channel1.publicKey).accounts({
              storage: userStorageAccount,
              subscription: subscriptionAccount,
              commStorage: storageAccount,
              signer: user1.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          }).signers([user1]).rpc();

          const afterBlockNumber = await getCurrentBlockNumber(program.provider.connection);
      
          // Fetch the user storage account to verify state updates
          const userStorage = await program.account.userStorage.fetch(userStorageAccount);
          expect(userStorage.userSubscribeCount.toNumber()).to.equal(1);
          expect(userStorage.userActivated).to.equal(true);

          const userStartBlock = Number(userStorage.userStartBlock);
          expect(userStartBlock).to.be.a('number', 'userStartBlock should be a number');
          expect(userStartBlock).to.be.at.least(beforeBlockNumber, `userStartBlock (${userStartBlock}) should be >= beforeBlockNumber (${beforeBlockNumber})`);
          expect(userStartBlock).to.be.at.most(afterBlockNumber, `userStartBlock (${userStartBlock}) should be <= afterBlockNumber (${afterBlockNumber})`);
      
          // Fetch the user subscription account to verify state updates
          const subscription = await program.account.subscription.fetch(subscriptionAccount);
          expect(subscription.isSubscribed).to.equal(true);
      });

      it("subscribe function should emit Subscribed event", async () => {
        const [storageAccount, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
        const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
        const [subscriptionAccount, bump3rd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
          
        let subscribedEvent: any = null;
        
        const listener = program.addEventListener('Subscribed', (event, slot) => {
          // console.log(`Slot ${slot}: Subscribed event - User: ${event.user}, Channel: ${event.channel}`);
          subscribedEvent = event;
        });

        // Subscribe user1
          await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccount,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Waiting to capture event
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Removing the event listener
      await program.removeEventListener(listener);

      // Assert that the event was emitted with correct parameters
      expect(subscribedEvent).to.not.be.null;
      expect(subscribedEvent.user.toString()).to.equal(user1.publicKey.toString());
      expect(subscribedEvent.channel.toString()).to.equal(channel1.publicKey.toString());
      });

      it ("Should not revert when user1 subscribe twice", async () => {
        const [storageAccount, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
        const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
        const [subscriptionAccount, bump3rd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
        
        // User1 subscribes to channel1
        await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccount,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

        let subscribedEvent: any = null;
        
        const listener = program.addEventListener('Subscribed', (event, slot) => {
          // console.log(`Slot ${slot}: Subscribed event - User: ${event.user}, Channel: ${event.channel}`);
          subscribedEvent = event;
        });

        // User1 tries to subscribe to channel1 again
        await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccount,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }).signers([user1]).rpc();

        // Waiting to capture event
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Removing the event listener
        await program.removeEventListener(listener);

        // Assert that the event was emitted with correct parameters
        expect(subscribedEvent).to.be.null;
      });

  });

  /**
   * Unsubscribe Function Tests
   * 1. Should update states accurately
   * 2. Shoud emit Unsubscribed event
   * 3. Should only work for subscribed users
   */

  describe("Unsubscription Basic Checks", () => {
        
    it("Should unsubscribe user1 & update states accurately", async () => {

      const [storageAccount, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
      const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccount, bump3rd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
        
      // Subscribe user1
      await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccount,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Fetch the user storage account to verify state updates for subscribe
      const userStorage_before = await program.account.userStorage.fetch(userStorageAccount);
      expect(userStorage_before.userSubscribeCount.toNumber()).to.equal(1);
      expect(userStorage_before.userActivated).to.equal(true);

      // Fetch the user subscription account to verify state updates for subscribe
      const subscription_before = await program.account.subscription.fetch(subscriptionAccount);
      expect(subscription_before.isSubscribed).to.equal(true);

      // Unsubscribe user1
      await program.methods.unsubscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccount,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Fetch the user storage account to verify state updates for unsubscribe
      const userStorage_now = await program.account.userStorage.fetch(userStorageAccount);
      expect(userStorage_now.userSubscribeCount.toNumber()).to.equal(0);
      expect(userStorage_now.userActivated).to.equal(true);

      // Fetch the user subscription account to verify state updates for unsubscibe
      const subscription = await program.account.subscription.fetchNullable(subscriptionAccount);
      expect(subscription).to.be.null;
    });

    it("Should emit Unsubscribed event", async () => {

      const [storageAccount, bump2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
      const [userStorageAccount, bump1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccount, bump3rd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
        
          // Subscribe user1
      await program.methods.subscribe(channel1.publicKey).accounts({
        storage: userStorageAccount,
        subscription: subscriptionAccount,
        commStorage: storageAccount,
        signer: user1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      let unsubscribedEvent: any = null;
      
      const listener = program.addEventListener('Unsubscribed', (event, slot) => {
        // console.log(`Slot ${slot}: Unsubscribed event - User: ${event.user}, Channel: ${event.channel}`);
        unsubscribedEvent = event;
      });

      // Unsubscribe user1
      await program.methods.unsubscribe(channel1.publicKey).accounts({
        storage: userStorageAccount,
        subscription: subscriptionAccount,
        commStorage: storageAccount,
        signer: user1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([user1]).rpc();

    // Waiting to capture event
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Removing the event listener
    await program.removeEventListener(listener);

    // Assert that the event was emitted with correct parameters
    expect(unsubscribedEvent).to.not.be.null;
    expect(unsubscribedEvent.user.toString()).to.equal(user1.publicKey.toString());
    expect(unsubscribedEvent.channel.toString()).to.equal(channel1.publicKey.toString());
  });
    });

  /**
   * Subscribe-Unsubscribe Advance Function Tests
   * 1. User1 should be able to subscribe to multiple channels
   * 2. User1 should be able to subscribe & then unsubscribe from multiple channels
   * 3. User1,2,3 should be able to subscribe to same channel - State should update accordingly
   */
  describe("Subscribe-Unsubcribe Advance Checks ", () => {
        
    it("User 1 should be able to subscribe to multiple channels", async () => {

      const [storageAccount] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
      const [userStorageAccount] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountFirst] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountSecond] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel2.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountThird] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel3.publicKey.toBuffer()], program.programId);

      // Subscribe user1 to channel1
      await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountFirst,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Subscribe user1 to channel2
      await program.methods.subscribe(channel2.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountSecond,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Subscribe user1 to channel3
      await program.methods.subscribe(channel3.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountThird,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Fetch the user storage account to verify state updates for subscribe
      const userStorage_before = await program.account.userStorage.fetch(userStorageAccount);
      expect(userStorage_before.userSubscribeCount.toNumber()).to.equal(3);
      expect(userStorage_before.userActivated).to.equal(true);

      // Fetch the user subscription account to verify state updates for subscribe
      const subscriptionFirst = await program.account.subscription.fetch(subscriptionAccountFirst);
      const subscriptionSecond = await program.account.subscription.fetch(subscriptionAccountSecond);
      const subscriptionThird = await program.account.subscription.fetch(subscriptionAccountThird);


      expect(subscriptionFirst.isSubscribed).to.equal(true);
      expect(subscriptionSecond.isSubscribed).to.equal(true);
      expect(subscriptionThird.isSubscribed).to.equal(true);
    });

    it("User1 should Subscribe-Unsubscribe multiple channels - State checks", async () => {

      const [storageAccount] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
      const [userStorageAccount] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountFirst] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountSecond] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel2.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountThird] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel3.publicKey.toBuffer()], program.programId);

      // Subscribe user1 to channel1
      await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountFirst,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Subscribe user1 to channel2
      await program.methods.subscribe(channel2.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountSecond,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Subscribe user1 to channel3
      await program.methods.subscribe(channel3.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountThird,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Fetch the user storage account to verify state updates for subscribe
      const userStorage_before = await program.account.userStorage.fetch(userStorageAccount);
      expect(userStorage_before.userSubscribeCount.toNumber()).to.equal(3);
      expect(userStorage_before.userActivated).to.equal(true);

      // Fetch the user subscription account to verify state updates for subscribe
      const subscription_before = await program.account.subscription.fetch(subscriptionAccountFirst);
      const subscription_second = await program.account.subscription.fetch(subscriptionAccountSecond);
      expect(subscription_before.isSubscribed).to.equal(true);
      expect(subscription_second.isSubscribed).to.equal(true);

      // Unsubscribe user1 from channel1
      await program.methods.unsubscribe(channel1.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountFirst,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Unsubscribe user1 from channel2 
      await program.methods.unsubscribe(channel2.publicKey).accounts({
          storage: userStorageAccount,
          subscription: subscriptionAccountSecond,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Fetch the user storage account to verify state updates for unsubscribe
      const userStorage_now = await program.account.userStorage.fetch(userStorageAccount);
      expect(userStorage_now.userSubscribeCount.toNumber()).to.equal(1);
      expect(userStorage_now.userActivated).to.equal(true);

      // Fetch the user subscription account to verify state updates for unsubscibe
      const subscriptionFirst_now = await program.account.subscription.fetchNullable(subscriptionAccountFirst);
      const subscriptionSecond_now = await program.account.subscription.fetchNullable(subscriptionAccountSecond);

      expect(subscriptionFirst_now).to.be.null;
      expect(subscriptionSecond_now).to.be.null;
    });

    it("Subscribe multiple users to same channel - State Checks", async () => {
      const [storageAccount] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.PUSH_COMM_STORAGE], program.programId);
      // Storage Accounts
      const [userStorage1st] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user1.publicKey.toBuffer()], program.programId);
      const [userStorage2nd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user2.publicKey.toBuffer()], program.programId);
      const [userStorage3rd] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.USER_STORAGE, user3.publicKey.toBuffer()], program.programId);
      // Subscripti on Accounts
      const [subscriptionAccountFirst] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user1.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountSecond] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user2.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);
      const [subscriptionAccountThird] = await anchor.web3.PublicKey.findProgramAddressSync([SEEDS.SUBSCRIPTION, user3.publicKey.toBuffer(), channel1.publicKey.toBuffer()], program.programId);

      // Subscribe user1 to channel1
      await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorage1st,
          subscription: subscriptionAccountFirst,
          commStorage: storageAccount,
          signer: user1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user1]).rpc();

      // Subscribe user2 to channel1
      await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorage2nd,
          subscription: subscriptionAccountSecond,
          commStorage: storageAccount,
          signer: user2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user2]).rpc();

      // Subscribe user3 to channel1
      await program.methods.subscribe(channel1.publicKey).accounts({
          storage: userStorage3rd,
          subscription: subscriptionAccountThird,
          commStorage: storageAccount,
          signer: user3.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([user3]).rpc();

      // Fetch the comm storage to check user count
      // To-Do: Fix the overall counting of users in beforeEach hook
      // const commStorage = await program.account.pushCommStorage.fetch(storageAccount);
      // expect(commStorage.userCount.toNumber()).to.equal(3); - Might not work as expected as user count is not updated in beforeEach hook

      // Fetch the user storage account to verify state updates for subscribe
      const userStorageFirst = await program.account.userStorage.fetch(userStorage1st);
      const userStorageSecond = await program.account.userStorage.fetch(userStorage2nd);
      const userStorageThird = await program.account.userStorage.fetch(userStorage3rd);

      expect(userStorageFirst.userSubscribeCount.toNumber()).to.equal(1);
      expect(userStorageSecond.userSubscribeCount.toNumber()).to.equal(1);
      expect(userStorageThird.userSubscribeCount.toNumber()).to.equal(1);

      expect(userStorageFirst.userActivated).to.equal(true);
      expect(userStorageSecond.userActivated).to.equal(true);
      expect(userStorageThird.userActivated).to.equal(true);

      // Fetch the user subscription account to verify state updates for subscribe
      const subscriptionFirst = await program.account.subscription.fetch(subscriptionAccountFirst);
      const subscriptionSecond = await program.account.subscription.fetch(subscriptionAccountSecond);
      const subscriptionThird = await program.account.subscription.fetch(subscriptionAccountThird);


      expect(subscriptionFirst.isSubscribed).to.equal(true);
      expect(subscriptionSecond.isSubscribed).to.equal(true);
      expect(subscriptionThird.isSubscribed).to.equal(true);
    });

  });

});