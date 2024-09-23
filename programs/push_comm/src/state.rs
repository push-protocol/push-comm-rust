use anchor_lang::prelude::*;

// STATES of PushComm Program

// Core Storage
#[account]
pub struct PushCommStorageV3 {
    pub governance: Pubkey,
    pub push_channel_admin: Pubkey,
    pub chain_id: u64,
    pub user_count: u64,
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

// Constant States
    pub const NAME: &str = "Push Comm V3"; // Check if this is actually needed
    pub const CHAIN_NAME: &str = "Solana Mainnet"; 
    pub const MAX_NOTIF_SETTINGS_LENGTH: usize = 100; // Adjust as needed

// Constants for Seeds
    pub const PUSH_COMM_STORAGE: &[u8] = b"push_comm_storage_v3";
    pub const USER_STORAGE: &[u8] = b"user_storage";
    pub const SUBSCRIPTION: &[u8] = b"is_subscribed";
    pub const DELEGATE: &[u8] = b"delegate";
    pub const USER_NOTIF_SETTINGS: &[u8] = b"user_notif_settings";