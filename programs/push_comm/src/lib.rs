use anchor_lang::prelude::*;
use borsh::de;
use core::mem::size_of;

//import custom files
pub mod state;
pub mod errors;
pub mod events;

use crate::state::*;
use crate::errors::*;
use crate::events::*;

declare_id!("7uczcz9GTYCneGpfNMBT1ccuFBGcLcF1seVGw9utaaw1");

#[program]
pub mod push_comm {
    use super::*;

    pub fn initialize(ctx: Context<InitializeCTX>, 
        push_admin: Pubkey, 
        chain_id: u64,
    ) -> Result<()> {
        let storage = &mut ctx.accounts.storage;
        storage.governance = push_admin;
        storage.push_channel_admin = push_admin;
        storage.chain_id = chain_id;
        Ok(())
    }

/**
 * ADMIN FUNCTIONS
 */
    pub fn set_core_address(ctx: Context<AdminStorageUpdateCTX>, //@audit - TBD IF NEEDED 
        push_core_address: Pubkey,
        ) -> Result <()> {
            let storage = &mut ctx.accounts.storage;
            storage.push_core_address = push_core_address;
            Ok(())
        }
    
    pub fn set_governance_address(ctx: Context<AdminStorageUpdateCTX>,
        governance: Pubkey,
    ) -> Result<()> {
        let storage = &mut ctx.accounts.storage;
        storage.governance = governance;
        Ok(())
    }

    pub fn set_push_token_address(ctx: Context<AdminStorageUpdateCTX>,
        token_address: Pubkey,
    ) -> Result<()> {
        let storage = &mut ctx.accounts.storage;
        storage.push_token_ntt = token_address;
        Ok(())
    }

    pub fn pause_contract(ctx: Context<AdminStorageUpdateCTX>,
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;
        require!(storage.paused == false, PushCommError::AlreadyPaused);
        storage.paused = true;
        Ok(())
    }

    pub fn unpause_contract(ctx: Context<AdminStorageUpdateCTX>,
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;
        require!(storage.paused == true, PushCommError::NotPaused);

        storage.paused = false;
        Ok(())
    }

    pub fn transfer_admin_ownership(ctx: Context<AdminStorageUpdateCTX>,
        new_owner: Pubkey
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;
        require!(!storage.paused, PushCommError::ContractPaused);

        storage.push_channel_admin = new_owner;
        Ok(())
    }


/**
 * PUBLIC FUNCTIONS
 */
    pub fn verify_channel_alias(ctx: Context<AliasVerificationCTX>,
        channel_address: String
    ) -> Result<()> {
        require!(channel_address.len() <= 64, PushCommError::InvalidArgument);

        let storage = &mut ctx.accounts.storage;
        require!(!storage.paused, PushCommError::ContractPaused);

        emit!(ChannelAlias {
            chain_name: CHAIN_NAME.to_string(),
            chain_id: storage.chain_id,
            channel_address: channel_address,
        });
        Ok(())
    }

    pub fn subscribe(ctx: Context<SubscriptionCTX>, channel: Pubkey) -> Result<()> {
        // TO-DO : add + _addUser() function logic here
        _add_user(&mut ctx.accounts.storage, &mut ctx.accounts.comm_storage)?;
        _subscribe(&mut ctx.accounts.storage, &mut ctx.accounts.subscription, ctx.accounts.signer.key(), channel)?;

        Ok(())
    }

    pub fn unsubscribe(ctx: Context<SubscriptionCTX>, channel: Pubkey) -> Result<()>{
        _unsubscribe(&mut ctx.accounts.storage, &mut ctx.accounts.subscription, ctx.accounts.signer.key(), channel)?;

        Ok(())
    }

    pub fn set_user_notification_settings(ctx: Context<UserChannelSettingsCTX>,
        channel: Pubkey,
        notif_id: u64,
        notif_settings: String
    ) -> Result<()> {
        let subscription = &ctx.accounts.subscription;
        let storage = &mut ctx.accounts.storage;
        
        require!(
            notif_settings.len() <= MAX_NOTIF_SETTINGS_LENGTH,
            PushCommError::InvalidArgument
        );    
        require!(subscription.is_subscribed == true, PushCommError::NotSubscribed);

        let notif_setting_data = format!("{}+{}", notif_id.to_string(), notif_settings);
        storage.notif_settings = notif_setting_data.clone();

        emit!(UserNotifcationSettingsAdded {
            channel: channel,
            user: ctx.accounts.signer.key(),
            notif_id: notif_id,
            notif_settings: notif_setting_data,
        });

        Ok(())
    }

    // Notification-Specific Functions
    pub fn add_delegate(ctx: Context<DelegateNotifSenders>,
        delegate: Pubkey
    ) -> Result<()>{
        // TO-DO :added _subscribe() function here
        let storage = &mut ctx.accounts.storage;
        require!( !storage.is_delegate, PushCommError::DelegateAlreadyAdded );

        storage.channel = ctx.accounts.signer.key();
        storage.delegate = delegate;
        storage.is_delegate = true;
        
        emit!(AddDelegate {
            channel: ctx.accounts.signer.key(),
            delegate: ctx.accounts.storage.delegate,
        });
        Ok(())
    }

    pub fn remove_delegate(ctx: Context<DelegateNotifSenders>,
        delegate: Pubkey
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;

        require!(storage.is_delegate, PushCommError::DelegateNotFound);

        storage.channel = ctx.accounts.signer.key();
        storage.delegate = delegate;
        storage.is_delegate = false;

        emit!(RemoveDelegate {
            channel: ctx.accounts.signer.key(),
            delegate: ctx.accounts.storage.delegate,
        });
        Ok(())
    }

    pub fn send_notification(ctx: Context<SendNotificationCTX>,
        channel: Pubkey,
        recipient: Pubkey,
        message: Vec<u8>,
    ) -> Result<()> {
            let caller = &ctx.accounts.signer;
            let delegate_storage = &ctx.accounts.delegate_storage;

            let is_valid = (delegate_storage.delegate == caller.key() && delegate_storage.is_delegate);

            if is_valid {
                emit!(SendNotification {
                    channel: channel,
                    recipient,
                    message,
                });
            }

        Ok(())
    }

    
}

/*
* PRIVATE HELPER FUNCTIONS
*/
fn _add_user(user_storage: &mut Account<UserStorage>, comm_storage: &mut Account<PushCommStorageV3>) -> Result<()> {
    if !user_storage.user_activated {
        user_storage.user_activated = true;
        user_storage.user_start_block = Clock::get()?.slot;

        comm_storage.user_count += 1;
    }
    Ok(())
}

fn _subscribe(user_storage: &mut Account<UserStorage>, subscription_storage: &mut Account<Subscription>, user: Pubkey, channel: Pubkey) -> Result<()> {
    require!(subscription_storage.is_subscribed == false, PushCommError::AlreadySubscribed);

    // Increase user subscribe count by check overflow
    user_storage.user_subscribe_count += 1;
    // Mark user as subscribed for a given channel
    subscription_storage.is_subscribed = true;

    emit!(Subscribed {
        user: user,
        channel: channel,
    });

    Ok(())
}

fn _unsubscribe(user_storage: &mut Account<UserStorage>, subscription_storage: &mut Account<Subscription>, user: Pubkey, channel: Pubkey) -> Result<()> {
    require!(subscription_storage.is_subscribed == true, PushCommError::NotSubscribed);

    // Decrease user subscribe count
    user_storage.user_subscribe_count = user_storage
    .user_subscribe_count
    .checked_sub(1)
    .ok_or(PushCommError::Underflow)?;
    // Mark user as unsubscribed for a given channel
    subscription_storage.is_subscribed = false;

    emit!(Unsubscribed {
        user: user,
        channel: channel,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeCTX<'info>{
    #[account(
        init,
        payer = signer,
        space = size_of::<PushCommStorageV3>() + 8,
        seeds = [PUSH_COMM_STORAGE],
        bump)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ADMIN-SPECIFIC-CONTEXT
#[derive(Accounts)]
pub struct AdminStorageUpdateCTX<'info> {
    #[account(mut, seeds = [PUSH_COMM_STORAGE], bump, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin: Signer<'info>,
}

// PUBLIC-CONTEXTS
#[derive(Accounts)]
pub struct AliasVerificationCTX <'info > {
    #[account(seeds = [PUSH_COMM_STORAGE], bump)]
    pub storage: Account<'info, PushCommStorageV3>
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct SubscriptionCTX<'info> {
    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + 1 + 8 + 8, // discriminator + bool + u64 + u64
        seeds = [USER_STORAGE, signer.key().as_ref()],
        bump
    )]
    pub storage: Account<'info, UserStorage>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + 1, // discriminator + bool
        seeds = [SUBSCRIPTION, signer.key().as_ref(), channel.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,
    
    #[account(mut, seeds = [PUSH_COMM_STORAGE], bump)]
    pub comm_storage: Account<'info, PushCommStorageV3>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct UserChannelSettingsCTX<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + 32 + 32 + 4 + MAX_NOTIF_SETTINGS_LENGTH, // discriminator + channel + user + notif_settings STRING
        seeds = [USER_NOTIF_SETTINGS, signer.key().as_ref(), channel.key().as_ref()],
        bump
    )]
    pub storage: Account<'info, UserNotificationSettings>,

    #[account(seeds = [SUBSCRIPTION, signer.key().as_ref(), channel.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
// Notification-Specific CTXs
#[derive(Accounts)]
#[instruction(delegate: Pubkey)]
pub struct DelegateNotifSenders <'info>{
    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + 32 + 32 + 1, // discriminator + channel + delegate + bool
        seeds = [DELEGATE, signer.key().as_ref(), delegate.key().as_ref()],
        bump )]
    pub storage: Account<'info, DelegatedNotificationSenders>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct SendNotificationCTX<'info> {
    #[account(seeds = [DELEGATE, 
        channel.key().as_ref(),
        signer.key().as_ref()],
        bump)]
    pub delegate_storage: Account<'info, DelegatedNotificationSenders>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

