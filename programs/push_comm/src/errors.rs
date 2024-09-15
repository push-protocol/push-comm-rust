use anchor_lang::prelude::*;

// Error Handling
#[error_code]
pub enum PushCommError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid argument provided")]
    InvalidArgument,
    #[msg("Program is currently paused")]
    AlreadyPaused,
    #[msg("Program is not paused")]
    NotPaused,
    #[msg("Contract is Paused")]
    ContractPaused,
    #[msg("Invalid Signature Parameters")]
    InvalidSignature,
    #[msg("Already Subscribed to this channel")]
    AlreadySubscribed,
    #[msg("Not Subscribed to this channel")]
    NotSubscribed,
    #[msg("Underflow Error")]
    Underflow,
    #[msg("Overflow Error")]
    Overflow,
    // Add more errors as needed
}