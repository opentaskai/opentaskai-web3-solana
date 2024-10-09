use anchor_lang::prelude::*;

// #[derive(Debug)]
#[event]
pub struct DepositEvent {
    pub sn: [u8; 32],
    pub account: [u8; 32],
    pub token: Pubkey,
    pub amount: u64,
    pub frozen: u64,
    pub user: Pubkey,
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

#[event]
pub struct FreezeEvent {
    pub sn: [u8; 32],
    pub account: [u8; 32],
    pub token: Pubkey,
    pub amount: u64,
    pub user: Pubkey,
}

#[event]
pub struct UnfreezeEvent {
    pub sn: [u8; 32],
    pub account: [u8; 32],
    pub token: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub user: Pubkey,
}

#[event]
pub struct TransferEvent {
    pub sn: [u8; 32],
    pub token: Pubkey,
    pub from: [u8; 32],
    pub to: [u8; 32],
    pub out: Pubkey,
    pub available: u64,
    pub frozen: u64,
    pub amount: u64,
    pub fee: u64,
    pub paid: u64,
    pub excess_fee: u64,
    pub user: Pubkey,
}