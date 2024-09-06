use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct PaymentState {
    pub owner: Pubkey,
    pub enabled: bool,
    pub nosn_enabled: bool,
    pub signer: Pubkey,
    pub fee_to: Pubkey,
    pub fee_to_account: [u8; 32],
    pub bump: u8,
}

impl PaymentState {
    pub const LEN: usize = 32 + 1 + 1 + 32 + 32 + 32 + 1;
}

#[account]
#[derive(Default)]
pub struct UserTokenAccount {
    pub mint: Pubkey,
    pub available: u64,
    pub frozen: u64,
}

impl UserTokenAccount {
    pub const LEN: usize = 32 + 8 + 8;
}

#[account]
#[derive(Default)]
pub struct TransactionRecord {
    pub executed: bool,
}

impl TransactionRecord {
    pub const LEN: usize = 1;
}
