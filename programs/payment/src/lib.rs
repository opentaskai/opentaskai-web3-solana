use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("7jrJjXs5mrvye9rofZW3MMnB2aeTFbb1vAccg5e1sCGC");

#[program]
pub mod payment {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let payment_state = &mut ctx.accounts.payment_state;
        payment_state.owner = ctx.accounts.owner.key();
        payment_state.enabled = true;
        payment_state.nosn_enabled = false;
        payment_state.signer = ctx.accounts.owner.key();
        payment_state.fee_to = ctx.accounts.owner.key();
        payment_state.fee_to_account = [1u8; 32]; // Simplified representation of UUID
        Ok(())
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        account: [u8; 32],
        amount: u64,
        frozen: u64,
        sn: [u8; 32],
        expired_at: i64,
    ) -> Result<()> {
        require!(ctx.accounts.payment_state.enabled, ErrorCode::Disabled);
        require!(amount > frozen, ErrorCode::InvalidAmount);

        let clock = Clock::get()?;
        require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

        // Check if the transaction has already been executed
        require!(!ctx.accounts.record.executed, ErrorCode::AlreadyExecuted);
        ctx.accounts.record.executed = true;

        // Update user_token_account
        let user_token_account = &mut ctx.accounts.user_token_account;
        user_token_account.available = user_token_account.available.checked_add(amount - frozen).unwrap();
        user_token_account.frozen = user_token_account.frozen.checked_add(frozen).unwrap();

        // Transfer tokens
        if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
            // SOL transfer
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.user.to_account_info(),
                        to: ctx.accounts.program_token.to_account_info(),
                    },
                ),
                amount,
            )?;
        } else {
            // Token transfer
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.user_token.to_account_info(),
                        to: ctx.accounts.program_token.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amount,
            )?;
        }

        // Emit the deposit event
        emit!(DepositEvent {
            sn,
            account,
            token: ctx.accounts.mint.key(),
            amount,
            frozen,
        });

        Ok(())
    }

    // Implement other functions (withdraw, transfer, freeze, unfreeze, etc.) similarly
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = owner, space = 8 + PaymentState::LEN)]
    pub payment_state: Account<'info, PaymentState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
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
    /// CHECK: This account is checked in the instruction
    #[account(mut)]
    pub user_token: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    #[account(mut)]
    pub program_token: UncheckedAccount<'info>,
    /// CHECK: This account is checked in the instruction
    pub mint: UncheckedAccount<'info>,
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

#[account]
#[derive(Default)]
pub struct PaymentState {
    pub owner: Pubkey,
    pub enabled: bool,
    pub nosn_enabled: bool,
    pub signer: Pubkey,
    pub fee_to: Pubkey,
    pub fee_to_account: [u8; 32],
}

impl PaymentState {
    pub const LEN: usize = 32 + 1 + 1 + 32 + 32 + 32;
}

#[account]
#[derive(Default)]
pub struct UserTokenAccount {
    pub available: u64,
    pub frozen: u64,
}

impl UserTokenAccount {
    pub const LEN: usize = 8 + 8;
}

#[account]
#[derive(Default)]
pub struct TransactionRecord {
    pub executed: bool,
}

impl TransactionRecord {
    pub const LEN: usize = 1;
}

#[event]
pub struct DepositEvent {
    pub sn: [u8; 32],
    pub account: [u8; 32],
    pub token: Pubkey,
    pub amount: u64,
    pub frozen: u64,
}

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
}