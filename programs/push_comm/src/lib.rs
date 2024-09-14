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

declare_id!("38y1vrywbkV9xNUBQ2rdi6E1PNxj2EhWgakpN3zLtneu");

#[program]
pub mod push_comm {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, 
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
    pub fn set_core_address(ctx: Context<SetCoreAddress>, 
        push_core_address: Pubkey,
        ) -> Result <()> {
            let storage = &mut ctx.accounts.storage;
            storage.push_core_address = push_core_address;
            Ok(())
        }
    
    pub fn set_governance_address(ctx: Context<SetGovernanceAddress>,
        governance: Pubkey,
    ) -> Result<()> {
        let storage = &mut ctx.accounts.storage;
        storage.governance = governance;
        Ok(())
    }

    pub fn set_push_token_address(ctx: Context<SetPushTokenAddress>,
        token_address: Pubkey,
    ) -> Result<()> {
        let storage = &mut ctx.accounts.storage;
        storage.push_token_ntt = token_address;
        Ok(())
    }

    pub fn pause_contract(ctx: Context<Pausability>,
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;
        require!(storage.paused == false, PushCommError::AlreadyPaused);
        storage.paused = true;
        Ok(())
    }

    pub fn unpause_contract(ctx: Context<Pausability>,
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;
        require!(storage.paused == true, PushCommError::NotPaused);

        storage.paused = false;
        Ok(())
    }

    pub fn transfer_admin_ownership(ctx: Context<OwnershipTransfer>,
        new_owner: Pubkey
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;

        storage.push_channel_admin = new_owner;
        Ok(())
    }


/**
 * PUBLIC FUNCTIONS
 */
    pub fn verify_channel_alias(ctx: Context<AliasVerification>,
        channel_address: String
    ) -> Result<()> {
        require!(channel_address.len() <= 64, PushCommError::InvalidArgument);
        let storage = &mut ctx.accounts.storage;
        emit!(ChannelAlias {
            chain_name: CHAIN_NAME.to_string(),
            chain_id: storage.chain_id,
            channel_address: channel_address,
        });
        Ok(())
    }

    pub fn add_delegate(ctx: Context<DelegateNotifSenders>,
        delegate: Pubkey
    ) -> Result<()>{
        // TO-DO :added _subscribe() function here
        let storage = &mut ctx.accounts.storage;
        
        storage.channel = ctx.accounts.user.key();
        storage.delegate = delegate;
        storage.is_delegate = true;
        
        emit!(AddDelegate {
            channel: ctx.accounts.user.key(),
            delegate: ctx.accounts.storage.delegate,
        });
        Ok(())
    }

    pub fn remove_delegate(ctx: Context<DelegateNotifSenders>,
        delegate: Pubkey
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;

        storage.channel = ctx.accounts.user.key();
        storage.delegate = delegate;
        storage.is_delegate = false;

        emit!(RemoveDelegate {
            channel: ctx.accounts.user.key(),
            delegate: ctx.accounts.storage.delegate,
        });
        Ok(())
    }

    pub fn subscribe(ctx: Context<SubscriptionContext>) -> Result<()> {
        // TO-DO : add + _addUser() function logic here
        _add_user(&mut ctx.accounts.storage, &mut ctx.accounts.comm_storage)?;
        let user = &mut ctx.accounts.storage;
        let subscription = &mut ctx.accounts.subscription;

        require!(subscription.is_subscribed == false, PushCommError::AlreadySubscribed);

        // Increase user subscribe count by check overflow
        user.user_subscribe_count += 1;
        // Mark user as subscribed for a given channel
        subscription.is_subscribed = true;
        

        emit!(Subscribed {
            user: ctx.accounts.user.key(),
            channel: ctx.accounts.channel.key(),
        });

        Ok(())
    }

    pub fn unsubscribe(ctx: Context<SubscriptionContext>) -> Result<()>{
        let user = &mut ctx.accounts.storage;
        let subscription = &mut ctx.accounts.subscription;

        require!(subscription.is_subscribed == true, PushCommError::NotSubscribed);

        // Decrease user subscribe count
        user.user_subscribe_count = user
        .user_subscribe_count
        .checked_sub(1)
        .ok_or(PushCommError::Underflow)?;
        // Mark user as unsubscribed for a given channel
        subscription.is_subscribed = false;

        emit!(Unsubscribed {
            user: ctx.accounts.user.key(),
            channel: ctx.accounts.channel.key(),
        });

        Ok(())
    }

    pub fn send_notification(ctx: Context<SendNotificationCTX>,
        recipient: Pubkey,
        message: Vec<u8>,
    ) -> Result<()> {
        let sender: &Signer<'_> = &ctx.accounts.sender;
        let delegate_storage = &ctx.accounts.delegate_storage;

        let is_authorized = (delegate_storage.channel == sender.key()) || 
            (delegate_storage.delegate == sender.key() && delegate_storage.is_delegate);

        if is_authorized {
            emit!(SendNotification {
                channel: delegate_storage.channel,
                recipient: recipient,
                message: message,
            });
        }

        Ok(())
    }

    pub fn set_user_notification_settings(ctx: Context<UserChannelSettings>,
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
            channel: ctx.accounts.channel.key(),
            user: ctx.accounts.storage.user,
            notif_id: notif_id,
            notif_settings: notif_setting_data,
        });

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

#[derive(Accounts)]
pub struct Initialize <'info>{
    #[account(init,
        payer = user,
        space = size_of::<PushCommStorageV3>() + 8,
        seeds = [b"push_comm_storage_v3"],
        bump)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ADMIN-SPECIFIC-CONTEXTS
#[derive(Accounts)]
pub struct SetCoreAddress <'info> {
    #[account(mut, seeds = [b"push_comm_storage_v3"], bump, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetGovernanceAddress <'info> {
    #[account(mut, seeds = [b"push_comm_storage_v3"], bump, has_one = governance @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub governance: Signer<'info>,

}

#[derive(Accounts)]
pub struct SetPushTokenAddress <'info> {
    #[account(mut, seeds = [b"push_comm_storage_v3"], bump, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Pausability<'info > {
    #[account(mut, seeds = [b"push_comm_storage_v3"], bump, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin : Signer<'info>,
}

#[derive(Accounts)]
pub struct OwnershipTransfer<'info> {
    #[account(mut, seeds = [b"push_comm_storage_v3"], bump, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin : Signer<'info>,
}

// PUBLIC-CONTEXTS
#[derive(Accounts)]
pub struct AliasVerification <'info > {
    #[account(seeds = [b"push_comm_storage_v3"], bump)]
    pub storage: Account<'info, PushCommStorageV3>
}

#[derive(Accounts)]
#[instruction(delegate: Pubkey)]
pub struct DelegateNotifSenders <'info>{
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 1, // discriminator + channel + delegate + bool
        seeds = [b"delegate", user.key().as_ref(), delegate.key().as_ref()],
        bump )]
    pub storage: Account<'info, DelegatedNotificationSenders>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct SubscriptionContext<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 1 + 8 + 8, // discriminator + bool + u64 + u64
        seeds = [b"user_storage", user.key().as_ref()],
        bump
    )]
    pub storage: Account<'info, UserStorage>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 1, // discriminator + bool
        seeds = [b"is_subscribed", user.key().as_ref(), channel.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,

    /// CHECK: This account is not read or written in this instruction
    pub channel: AccountInfo<'info>,
    
    #[account(mut, seeds = [b"push_comm_storage_v3"], bump)]
    pub comm_storage: Account<'info, PushCommStorageV3>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey, delegate: Pubkey)]
pub struct SendNotificationCTX<'info> {
    #[account(seeds = [b"delegate", channel.key().as_ref(), delegate.key().as_ref()], bump)]
    pub delegate_storage: Account<'info, DelegatedNotificationSenders>,

    #[account(mut)]
    pub sender: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(channel: Pubkey)]
pub struct UserChannelSettings<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32 + 32, // discriminator + channel + user + notif_settings
        seeds = [b"user_notif_settings", user.key().as_ref(), channel.key().as_ref()],
        bump
    )]
    pub storage: Account<'info, UserNotificationSettings>,

    #[account(seeds = [b"is_subscribed", user.key().as_ref(), channel.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,

    /// CHECK: This account is not read or written in this instruction
    pub channel: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
