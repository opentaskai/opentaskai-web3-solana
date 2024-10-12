use anchor_lang::prelude::*;
use crate::utils::{verify_ed25519_instruction, transfer_sol, transfer_token};
use crate::errors::ErrorCode;
use crate::events::WithdrawEvent;
use crate::Withdraw;

pub fn handler(
    ctx: Context<Withdraw>,
    sn: [u8; 32],
    from: [u8; 32],
    available: u64,
    frozen: u64,
    expired_at: i64,
    signature: [u8; 64],
) -> Result<()> {
    // Check if the record already exists
    require!(ctx.accounts.record.executed == false, ErrorCode::AlreadyExecuted);
    // Check if the request is expired
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

    let message = [&sn[..], &from[..], &available.to_le_bytes(), &frozen.to_le_bytes(), &expired_at.to_le_bytes()].concat();
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

    // Settlement tokens
    let total_amount = available.checked_add(frozen).unwrap();

    if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
        transfer_sol(
            &ctx.accounts.program_token,
            &ctx.accounts.to,
            &ctx.accounts.system_program,
            ctx.bumps.program_token,
            total_amount,
        )?;
    } else {
        transfer_token(
            &ctx.accounts.program_token,
            &ctx.accounts.to,
            &ctx.accounts.token_program,
            &ctx.accounts.payment_state,
            ctx.bumps.payment_state,
            total_amount,
        )?;
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