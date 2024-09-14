use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};
use crate::utils::verify_ed25519_instruction;
use crate::errors::ErrorCode;
use crate::events::WithdrawEvent;
use crate::Withdraw;

pub fn handler(
    ctx: Context<Withdraw>,
    from: [u8; 32],
    available: u64,
    frozen: u64,
    sn: [u8; 32],
    expired_at: i64,
    signature: [u8; 64],
) -> Result<()> {
    // Check if the record already exists
    require!(ctx.accounts.record.executed == false, ErrorCode::AlreadyExecuted);
    // Check if the request is expired
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

    let message = [&from[..], &available.to_le_bytes(), &frozen.to_le_bytes(), &sn[..], &expired_at.to_le_bytes()].concat();
    verify_ed25519_instruction(
        &ctx.accounts.instruction_sysvar,
        ctx.accounts.payment_state.signer.as_ref(),
        &message,
        &signature,
    )?;

    // Mark the record as executed
    ctx.accounts.record.executed = true;

    let user_token_account = &mut ctx.accounts.user_token_account;
    require!(user_token_account.available >= available, ErrorCode::InsufficientAvailable);
    require!(user_token_account.frozen >= frozen, ErrorCode::InsufficientFrozen);

    user_token_account.available = user_token_account.available.checked_sub(available).unwrap();
    user_token_account.frozen = user_token_account.frozen.checked_sub(frozen).unwrap();

    if user_token_account.mint == Pubkey::default() {
        user_token_account.mint = ctx.accounts.mint.key();
    }

    // Transfer tokens
    let total_amount = available.checked_add(frozen).unwrap();
    if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
        _handler_sol(&ctx, total_amount)?;
    } else {
        _handler_token(&ctx, total_amount)?;
    }

    // Emit withdraw event
    emit!(WithdrawEvent {
        sn,
        token: ctx.accounts.mint.key(),
        from,
        to: ctx.accounts.to.key(),
        available,
        frozen,
        user: ctx.accounts.user.key(),
    });

    Ok(())
}

fn _handler_sol(ctx: &Context<Withdraw>, amount: u64) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"program-token",
        mint_key.as_ref(),
        &[ctx.bumps.program_token],
    ];

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.program_token.key,
            ctx.accounts.to.key,
            amount,
        ),
        &[
            ctx.accounts.program_token.to_account_info(),
            ctx.accounts.to.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[seeds],
    )?;

    Ok(())
}

fn _handler_token(ctx: &Context<Withdraw>, amount: u64) -> Result<()> {
    // Check if the program token is initialized
    let program_token = TokenAccount::try_deserialize(&mut &ctx.accounts.program_token.data.borrow()[..])?;
    require!(program_token.mint == ctx.accounts.mint.key(), ErrorCode::InvalidProgramToken);

    let seeds = &[
        b"payment-state".as_ref(),
        &[ctx.bumps.payment_state],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.program_token.to_account_info(),
                to: ctx.accounts.to.to_account_info(),
                authority: ctx.accounts.payment_state.to_account_info(),
            },
            &[seeds],
        ),
        amount
    )?;
    Ok(())
}
