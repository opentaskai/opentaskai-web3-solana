use anchor_lang::prelude::*;

// #[derive(Debug)]
#[event]
pub struct DepositEvent {
    pub sn: [u8; 32],
    pub account: [u8; 32],
    pub token: Pubkey,
    pub amount: u64,
    pub frozen: u64,
}

#[event]
pub struct WithdrawEvent {
    pub sn: [u8; 32],
    pub token: Pubkey,
    pub from: [u8; 32],
    pub to: Pubkey,
    pub available: u64,
    pub frozen: u64,
    pub user: Pubkey,
}