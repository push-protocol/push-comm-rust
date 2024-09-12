use anchor_lang::prelude::*;
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
    use anchor_lang::accounts::account;

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
        let storage = &mut ctx.accounts.storage;
        emit!(ChannelAlias {
            chain_name: CHAIN_NAME.to_string(),
            chain_id: storage.chain_id,
            channel_address: channel_address,
        });
        Ok(())
    }

    pub fn add_delegate(ctx: Context<DelegateNotifSenders>,
        channel: Pubkey,
        delegate: Pubkey
    ) -> Result<()>{
        // TO-DO :added _subscribe() function here
        let storage = &mut ctx.accounts.storage;
        
        storage.channel = channel;
        storage.delegate = delegate;
        storage.is_delegate = true;
        
        emit!(AddDelegate {
            channel: ctx.accounts.storage.channel,
            delegate: ctx.accounts.storage.delegate,
        });
        Ok(())
    }

    pub fn remove_delegate(ctx: Context<DelegateNotifSenders>,
        channel: Pubkey,
        delegate: Pubkey
    ) -> Result<()>{
        let storage = &mut ctx.accounts.storage;

        storage.channel = channel;
        storage.delegate = delegate;
        storage.is_delegate = false;

        emit!(RemoveDelegate {
            channel: ctx.accounts.storage.channel,
            delegate: ctx.accounts.storage.delegate,
        });
        Ok(())
    }
    
}

#[derive(Accounts)]
pub struct Initialize <'info>{
    #[account(init,
        payer = user,
        space = size_of::<PushCommStorageV3>() + 8,
        seeds = [],
        bump)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ADMIN-SPECIFIC-CONTEXTS
#[derive(Accounts)]
pub struct SetCoreAddress <'info> {
    #[account(mut, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetGovernanceAddress <'info> {
    #[account(mut, has_one = governance @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub governance: Signer<'info>,

}

#[derive(Accounts)]
pub struct SetPushTokenAddress <'info> {
    #[account(mut, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Pausability<'info > {
    #[account(mut, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin : Signer<'info>,
}

#[derive(Accounts)]
pub struct OwnershipTransfer<'info> {
    #[account(mut, has_one = push_channel_admin @ PushCommError::Unauthorized)]
    pub storage: Account<'info, PushCommStorageV3>,

    #[account(signer)]
    pub push_channel_admin : Signer<'info>,
}

// PUBLIC-CONTEXTS
#[derive(Accounts)]
pub struct AliasVerification <'info > {
    #[account(mut)]
    pub storage: Account<'info, PushCommStorageV3>
}

#[derive(Accounts)]
#[instruction(channel: Pubkey, delegate: Pubkey)]
pub struct DelegateNotifSenders <'info>{
    #[account(
        init,
        payer = user,
        space = 8 + 1, // discriminator + bool
        seeds = [b"delegate", channel.key().as_ref(), delegate.key().as_ref()],
        bump )]
    pub storage: Account<'info, DelegatedNotificationSenders>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}