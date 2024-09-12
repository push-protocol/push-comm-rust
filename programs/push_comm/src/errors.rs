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
    #[msg("Invalid Signature Parameters")]
    InvalidSignature,
    // Add more errors as needed
}