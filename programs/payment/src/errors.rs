use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("The program is disabled")]
    Disabled,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Transaction expired")]
    Expired,
    #[msg("Invalid signature")]
    InvalidSignature,
    #[msg("Transaction already executed")]
    AlreadyExecuted,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Forbidden")]
    Forbidden,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Insufficient available balance")]
    InsufficientAvailable,
    #[msg("Insufficient frozen balance")]
    InsufficientFrozen,
    #[msg("Invalid program token")]
    InvalidProgramToken,
}