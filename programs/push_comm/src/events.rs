use anchor_lang::prelude::*;

// Events
#[event]
pub struct ChannelAlias{
    pub chain_name: String,
    pub chain_id: u64,
    pub channel_address: String,
}
#[event]
pub struct AddDelegate{
    pub channel: Pubkey,
    pub delegate: Pubkey,
}
#[event]
pub struct RemoveDelegate{
    pub channel: Pubkey,
    pub delegate: Pubkey,
}

#[event]
pub struct Subscribed{
    pub user: Pubkey,
    pub channel: Pubkey,
}

#[event]
pub struct Unsubscribed{
    pub user: Pubkey,
    pub channel: Pubkey,
}

#[event]
pub struct SendNotification{
    pub channel: Pubkey,
    pub recipient: Pubkey,
    pub message: Vec<u8>,
}

#[event]
pub struct UserNotifcationSettingsAdded{
    pub channel: Pubkey,
    pub user: Pubkey,
    pub notif_id: u64,
    pub notif_settings : String,
}