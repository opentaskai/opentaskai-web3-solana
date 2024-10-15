use anchor_lang::prelude::*;
use anchor_spl::token::{Token};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{PaymentState, UserTokenAccount, TransactionRecord, SettlementData};

declare_id!("7mEtBse9oundTRfuYNTmPBaYr1gGNM5sewKDo23meJXe");

pub mod state;
pub mod errors;
pub mod events;
pub mod utils;
pub mod instructions;

use instructions::*;

#[program]
pub mod payment {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }

    pub fn initialize_program_token(ctx: Context<InitializeProgramToken>) -> Result<()> {
        admin::initialize_program_token(ctx)
    }

    pub fn change_owner(ctx: Context<ChangeOwner>) -> Result<()> {
        admin::change_owner(ctx)
    }

    pub fn change_signer(ctx: Context<ChangeOwner>) -> Result<()> {
        admin::change_signer(ctx)
    }

    pub fn change_fee_to(ctx: Context<ChangeOwner>) -> Result<()> {
        admin::change_fee_to(ctx)
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        sn: [u8; 32],
        account: [u8; 32],
        amount: u64,
        frozen: u64,
        expired_at: i64,
        signature: [u8; 64],
    ) -> Result<()> {
        deposit::handler(ctx, sn, account, amount, frozen, expired_at, signature)
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        sn: [u8; 32],
        from: [u8; 32],
        available: u64,
        frozen: u64,
        expired_at: i64,
        signature: [u8; 64],
    ) -> Result<()> {
        withdraw::handler(ctx, sn, from, available, frozen, expired_at, signature)
    }

    pub fn freeze(
        ctx: Context<Freeze>,
        sn: [u8; 32],
        account: [u8; 32],
        amount: u64,
        expired_at: i64,
        signature: [u8; 64],
    ) -> Result<()> {
        freeze::handler(ctx, sn, account, amount, expired_at, signature)
    }

    pub fn unfreeze(
        ctx: Context<Unfreeze>,
        sn: [u8; 32],
        account: [u8; 32],
        amount: u64, // amount to unfreeze
        fee: u64,  // fee to deduct, from amount
        expired_at: i64,
        signature: [u8; 64],
    ) -> Result<()> {
        unfreeze::handler(ctx, sn, account, amount, fee, expired_at, signature)
    }

    pub fn transfer(
        ctx: Context<Transfer>,
        sn: [u8; 32],
        from: [u8; 32],
        to: [u8; 32],
        amount: u64, // amount to transfer
        fee: u64, // fee to deduct, from amount
        expired_at: i64,
        signature: [u8; 64],
    ) -> Result<()> {
        transfer::handler(ctx, sn, from, to, amount, fee, expired_at, signature)
    }

    pub fn settle(
        ctx: Context<Settlement>,
        sn: [u8; 32],
        deal: SettlementData,
        expired_at: i64,
        signature: [u8; 64],
    ) -> Result<()> {
        settle::handler(ctx, sn, deal, expired_at, signature)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + PaymentState::LEN,
        seeds = [b"payment-state"],
        bump
    )]
    pub payment_state: Account<'info, PaymentState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeProgramToken<'info> {
    #[account(mut)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This account is checked in the instruction handler
    pub mint: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        space = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { 0 } else { 165 },
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    /// CHECK: This account is checked in the instruction
    pub program_token: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + UserTokenAccount::LEN,
        seeds = [b"user-token", payment_state.fee_to_account.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub fee_token_account: Account<'info, UserTokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ChangeOwner<'info> {
    #[account(mut)]
    pub payment_state: Account<'info, PaymentState>,
    pub current_owner: Signer<'info>,
    /// CHECK: This is the new owner
    pub new_owner: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(sn: [u8; 32], account: [u8; 32])]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"payment-state"], bump)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserTokenAccount::LEN,
        seeds = [b"user-token", account.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub user_token_account: Account<'info, UserTokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This account is checked in the instruction handler
    pub mint: UncheckedAccount<'info>,
    /// CHECK: This is the token account that we want to transfer to
    #[account(mut)]
    pub user_token: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(
        mut,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    pub program_token: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TransactionRecord::LEN,
        seeds = [b"record", sn.as_ref()],
        bump
    )]
    pub record: Account<'info, TransactionRecord>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This account is used to verify the Ed25519 instruction
    pub instruction_sysvar: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(sn: [u8; 32], from: [u8; 32])]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"payment-state"], bump)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserTokenAccount::LEN,
        seeds = [b"user-token", from.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub user_token_account: Account<'info, UserTokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This account is checked in the instruction handler
    pub mint: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
    /// CHECK: This is the token account that we want to transfer to
    #[account(
        mut,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    /// CHECK: This account is checked in the instruction
    pub program_token: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TransactionRecord::LEN,
        seeds = [b"record", sn.as_ref()],
        bump
    )]
    pub record: Account<'info, TransactionRecord>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This account is used to verify the Ed25519 instruction
    pub instruction_sysvar: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(sn: [u8; 32], account: [u8; 32])]
pub struct Freeze<'info> {
    #[account(mut, seeds = [b"payment-state"], bump)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserTokenAccount::LEN,
        seeds = [b"user-token", account.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub user_token_account: Account<'info, UserTokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This account is checked in the instruction handler
    pub mint: UncheckedAccount<'info>,
    /// CHECK: This is the token account that we want to transfer to
    #[account(
        mut,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    /// CHECK: This account is checked in the instruction
    pub program_token: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TransactionRecord::LEN,
        seeds = [b"record", sn.as_ref()],
        bump
    )]
    pub record: Account<'info, TransactionRecord>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This account is used to verify the Ed25519 instruction
    pub instruction_sysvar: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(sn: [u8; 32], from: [u8; 32])]
pub struct Unfreeze<'info> {
    #[account(mut, seeds = [b"payment-state"], bump)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserTokenAccount::LEN,
        seeds = [b"user-token", from.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub user_token_account: Account<'info, UserTokenAccount>,
    #[account(
        mut,
        seeds = [b"user-token", payment_state.fee_to_account.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub fee_token_account: Account<'info, UserTokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This account is checked in the instruction handler
    pub mint: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    /// CHECK: This account is checked in the instruction
    pub program_token: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TransactionRecord::LEN,
        seeds = [b"record", sn.as_ref()],
        bump
    )]
    pub record: Account<'info, TransactionRecord>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This account is used to verify the Ed25519 instruction
    pub instruction_sysvar: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(sn: [u8; 32], from: [u8; 32], to: [u8; 32])]
pub struct Transfer<'info> {
    #[account(mut, seeds = [b"payment-state"], bump)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(
        mut,
        seeds = [b"user-token", from.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub from_token_account: Account<'info, UserTokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserTokenAccount::LEN,
        seeds = [b"user-token", to.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub to_token_account: Account<'info, UserTokenAccount>,
    #[account(
        mut,
        seeds = [b"user-token", payment_state.fee_to_account.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub fee_token_account: Account<'info, UserTokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This account is checked in the instruction handler
    pub mint: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(mut)]
    pub out: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(mut)]
    pub fee_user: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(
        mut,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    pub program_token: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TransactionRecord::LEN,
        seeds = [b"record", sn.as_ref()],
        bump
    )]
    pub record: Account<'info, TransactionRecord>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This account is used to verify the Ed25519 instruction
    pub instruction_sysvar: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}


#[derive(Accounts)]
#[instruction(sn: [u8; 32], deal: SettlementData)]
pub struct Settlement<'info> {
    #[account(mut, seeds = [b"payment-state"], bump)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(
        mut,
        seeds = [b"user-token", deal.from.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub from_token_account: Account<'info, UserTokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserTokenAccount::LEN,
        seeds = [b"user-token", deal.to.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub to_token_account: Account<'info, UserTokenAccount>,
    #[account(
        mut,
        seeds = [b"user-token", payment_state.fee_to_account.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub fee_token_account: Account<'info, UserTokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This account is checked in the instruction handler
    pub mint: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(mut)]
    pub out: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(mut)]
    pub fee_user: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(
        mut,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    pub program_token: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TransactionRecord::LEN,
        seeds = [b"record", sn.as_ref()],
        bump
    )]
    pub record: Account<'info, TransactionRecord>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: This account is used to verify the Ed25519 instruction
    pub instruction_sysvar: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}
