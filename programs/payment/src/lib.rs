use anchor_lang::prelude::*;
use anchor_spl::token::{Token};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{PaymentState, UserTokenAccount, TransactionRecord};

declare_id!("7jrJjXs5mrvye9rofZW3MMnB2aeTFbb1vAccg5e1sCGC");

pub mod state;
pub mod errors;
pub mod events;
pub mod instructions;

use instructions::*;

#[program]
pub mod payment {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }

    pub fn initialize_program_token(ctx: Context<InitializeProgramToken>) -> Result<()> {
        initialize_program_token::handler(ctx)
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        account: [u8; 32],
        amount: u64,
        frozen: u64,
        sn: [u8; 32],
        expired_at: i64,
    ) -> Result<()> {
        deposit::handler(ctx, account, amount, frozen, sn, expired_at)
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        from: [u8; 32],
        available: u64,
        frozen: u64,
        sn: [u8; 32],
        expired_at: i64
    ) -> Result<()> {
        withdraw::handler(ctx, from, available, frozen, sn, expired_at)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + PaymentState::LEN,
        seeds = [b"payment_state"],
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
        init,
        payer = owner,
        seeds = [b"program-token", mint.key().as_ref()],
        bump,
        space = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { 0 } else { 165 },
        owner = if *mint.key == anchor_spl::token::spl_token::native_mint::id() { system_program.key() } else { token_program.key() }
    )]
    /// CHECK: This account is initialized in the instruction handler
    pub program_token: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(account: [u8; 32], amount: u64, frozen: u64, sn: [u8; 32], expired_at: i64)]
pub struct Deposit<'info> {
    #[account(mut)]
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
    /// CHECK: This account is checked in the instruction
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
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(from: [u8; 32], available: u64, frozen: u64, sn: [u8; 32], expired_at: i64)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"payment_state"], bump)]
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
    /// CHECK: This is the token account that we want to transfer from
    #[account(mut)]
    pub user_token: UncheckedAccount<'info>,
    /// CHECK: This is the token account that we want to transfer to
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
    pub rent: Sysvar<'info, Rent>,
}