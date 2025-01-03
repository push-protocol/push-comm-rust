use anchor_lang::prelude::*;
use core::mem::size_of;

//import custom files
pub mod state;
pub mod errors;
pub mod events;

use crate::state::*;
use crate::errors::*;
use crate::events::*;

declare_id!("49BqhK92MRb1tpwn5ceLsZZnGoSQaWzYRcPC6doCgUiE");

#[program]
pub mod push_comm {
    use super::*;

    pub fn initialize(ctx: Context<InitializeCTX>, 
        push_admin: Pubkey, 
        chain_cluster: String,
    ) -> Result<()> {
        let storage = &mut ctx.accounts.storage;
        storage.governance = push_admin;
        storage.push_channel_admin = push_admin;
        storage.chain_cluster = chain_cluster;
        Ok(())
    }

/**
 * ADMIN FUNCTIONS
 */ 
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

    pub fn set_chain_cluster(ctx: Context<AdminStorageUpdateCTX>,
        chain_cluster: String,
    ) -> Result<()> {
        let storage = &mut ctx.accounts.storage;
        storage.chain_cluster = chain_cluster;
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

        // Revert if new_owner is the default (zero) address
        require!(new_owner != Pubkey::default(), PushCommError::InvalidArgument);

        storage.push_channel_admin = new_owner;
        Ok(())
    }


/**
 * PUBLIC FUNCTIONS
 */
    pub fn verify_channel_alias(ctx: Context<AliasVerificationCTX>,
        channel_address: String
    ) -> Result<()> {
        // ChannelAddress can only be a EVM address as per design
        require!(
            channel_address.len() == 42 && channel_address.starts_with("0x"),
            PushCommError::InvalidArgument
        );

        let storage = &mut ctx.accounts.storage;

        emit!(ChannelAlias {
            chain_name: CHAIN_NAME.to_string(),
            chain_cluster: storage.chain_cluster.clone(),
            channel: ctx.accounts.signer.key(),
            ethereum_channel_address: channel_address,
        });
        Ok(())
    }

    pub fn subscribe(ctx: Context<SubscribeCTX>, channel: Pubkey) -> Result<()> {
        _add_user(&mut ctx.accounts.storage, &mut ctx.accounts.comm_storage)?;
        _subscribe(&mut ctx.accounts.storage, &mut ctx.accounts.subscription, ctx.accounts.signer.key(), channel)?;

        Ok(())
    }

    pub fn unsubscribe(ctx: Context<UnsubscribeCTX>, channel: Pubkey) -> Result<()>{
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

        emit!(UserNotificationSettingsAdded {
            channel: channel,
            user: ctx.accounts.signer.key(),
            notif_id: notif_id,
            notif_settings: notif_setting_data,
        });

        Ok(())
    }

    // Notification-Specific Functions
    pub fn add_delegate(ctx: Context<AddDelegateNotifSenders>, delegate: Pubkey) -> Result<()> {
        let storage = &mut ctx.accounts.storage;

        if !storage.is_delegate {
            storage.channel = ctx.accounts.signer.key();
            storage.delegate = delegate;
            storage.is_delegate = true;
            
            emit!(AddDelegate {
                channel: ctx.accounts.signer.key(),
                delegate: ctx.accounts.storage.delegate,
            });
        }

        Ok(())
    }

    pub fn remove_delegate(ctx: Context<RemoveDelegateNotifSenders>,
        delegate: Pubkey
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;

        if storage.is_delegate {
            storage.channel = ctx.accounts.signer.key();
            storage.delegate = delegate;
            storage.is_delegate = false;

            emit!(RemoveDelegate {
                channel: ctx.accounts.signer.key(),
                delegate: ctx.accounts.storage.delegate,
            });
        }
    
        Ok(())
    }
    
    pub fn send_notification(
        ctx: Context<SendNotificationCTX>,
        channel: Pubkey,
        recipient: Pubkey,
        message: Vec<u8>,
    ) -> Result<()> {
        let caller = &ctx.accounts.signer;
        let delegate_storage = &ctx.accounts.delegate_storage;
    
        // Check if the caller is a valid delegate or the channel itself
        let is_valid = (delegate_storage.delegate == caller.key() && delegate_storage.is_delegate)
            || (caller.key() == channel);
    
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
fn _add_user(user_storage: &mut Account<UserStorage>, comm_storage: &mut Account<PushCommStorage>) -> Result<()> {
    if !user_storage.user_activated {
        user_storage.user_activated = true;
        user_storage.user_start_block = Clock::get()?.slot;

        comm_storage.user_count += 1;
    }
    Ok(())
}

fn _subscribe(user_storage: &mut Account<UserStorage>, subscription_storage: &mut Account<Subscription>, user: Pubkey, channel: Pubkey) -> Result<()> {
    if !subscription_storage.is_subscribed {

        // Increase user subscribe count by check overflow
        user_storage.user_subscribe_count += 1;
        // Mark user as subscribed for a given channel
        subscription_storage.is_subscribed = true;

        emit!(Subscribed {
            user: user,
            channel: channel,
        });
    }

    Ok(())
}

fn _unsubscribe(user_storage: &mut Account<UserStorage>, subscription_storage: &mut Account<Subscription>, user: Pubkey, channel: Pubkey) -> Result<()> {
    if subscription_storage.is_subscribed {

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

    }

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeCTX<'info>{
    #[account(
        init,
        payer = signer,
        space = size_of::<PushCommStorage>() + 8,
        seeds = [PUSH_COMM_STORAGE],
        bump)]
    pub storage: Account<'info, PushCommStorage>,

    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(address = crate::ID)]
    pub program: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ADMIN-SPECIFIC-CONTEXT
#[derive(Accounts)]
pub struct AdminStorageUpdateCTX<'info> {
    #[account(mut, seeds = [PUSH_COMM_STORAGE], bump, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorage>,

    #[account(signer)]
    pub push_channel_admin: Signer<'info>,
}

// PUBLIC-CONTEXTS
#[derive(Accounts)]
pub struct AliasVerificationCTX <'info > {
    #[account(seeds = [PUSH_COMM_STORAGE], bump)]
    pub storage: Account<'info, PushCommStorage>,

    #[account(signer)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct SubscribeCTX<'info> {
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
    pub comm_storage: Account<'info, PushCommStorage>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct UnsubscribeCTX<'info> {
    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + 1 + 8 + 8, // discriminator + bool + u64 + u64
        seeds = [USER_STORAGE, signer.key().as_ref()],
        bump
    )]
    pub storage: Account<'info, UserStorage>,

    #[account(
        mut,
        seeds = [SUBSCRIPTION, signer.key().as_ref(), channel.key().as_ref()],
        bump,
        close = signer
    )]
    pub subscription: Account<'info, Subscription>,
    
    #[account(mut, seeds = [PUSH_COMM_STORAGE], bump)]
    pub comm_storage: Account<'info, PushCommStorage>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct UserChannelSettingsCTX<'info> {
    #[account(
        init_if_needed,
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
pub struct AddDelegateNotifSenders <'info>{
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
#[instruction(delegate: Pubkey)]
pub struct RemoveDelegateNotifSenders <'info>{
    #[account(
        mut,
        seeds = [DELEGATE, signer.key().as_ref(), delegate.key().as_ref()],
        bump,
        close = signer )]
    pub storage: Account<'info, DelegatedNotificationSenders>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct SendNotificationCTX<'info> {
    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + 32 + 32 + 1, // discriminator + channel + delegate + bool
        seeds = [DELEGATE, channel.key().as_ref(), signer.key().as_ref()],
        bump)]
    pub delegate_storage: Account<'info, DelegatedNotificationSenders>,

    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

