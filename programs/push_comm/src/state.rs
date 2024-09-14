use anchor_lang::prelude::*;

declare_id!("38y1vrywbkV9xNUBQ2rdi6E1PNxj2EhWgakpN3zLtneu");

// Constant States
pub const NAME: &str = "Push Comm V3"; // Check if this is actually needed
pub const CHAIN_NAME: &str = "Solana Mainnet"; 
pub const MAX_NOTIF_SETTINGS_LENGTH: usize = 100; // Adjust as needed

// STATES of PushComm Program

// Core Storage
#[account]
pub struct PushCommStorageV3 {
    pub governance: Pubkey,
    pub push_channel_admin: Pubkey,
    pub chain_id: u64,
    pub user_count: u64,
    pub is_migration_complete: bool, // @audit - Might be removed
    pub push_core_address: Pubkey,
    pub push_token_ntt: Pubkey,
    pub paused: bool,
}
// User Storage
#[account]
pub struct UserStorage{
    pub user_activated: bool,
    pub user_start_block: u64,
    pub user_subscribe_count: u64,
}
// UserStorage-Specific Mappings
#[account]
pub struct Subscription{
    pub is_subscribed: bool,
}

// Additional Key-Value Maps
#[account]
pub struct DelegatedNotificationSenders{
    pub channel: Pubkey,
    pub delegate: Pubkey,
    pub is_delegate: bool,
}

#[account]
pub struct UserNotificationSettings{
    pub channel: Pubkey,
    pub user: Pubkey,
    pub notif_settings: String,
}