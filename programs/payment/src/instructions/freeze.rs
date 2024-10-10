use anchor_lang::prelude::*;
use crate::utils::verify_ed25519_instruction;
use crate::errors::ErrorCode;
use crate::events::FreezeEvent;
use crate::Freeze;

pub fn handler(
    ctx: Context<Freeze>,
    sn: [u8; 32],
    account: [u8; 32],
    amount: u64,
    expired_at: i64,
    signature: [u8; 64],
) -> Result<()> {
    require!(ctx.accounts.payment_state.enabled, ErrorCode::Disabled);
    require!(amount > 0, ErrorCode::ZeroAmount);

    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

    let message = [ &sn[..], &account[..], &amount.to_le_bytes(), &expired_at.to_le_bytes()].concat();
    verify_ed25519_instruction(
        &ctx.accounts.instruction_sysvar,
        ctx.accounts.payment_state.signer.as_ref(),
        &message,
        &signature,
    )?;
    
    // Check if the transaction has already been executed
    require!(!ctx.accounts.record.executed, ErrorCode::AlreadyExecuted);
    ctx.accounts.record.executed = true;

    // Check if the user has enough available balance
    let user_token_account = &mut ctx.accounts.user_token_account;
    require!(user_token_account.available >= amount, ErrorCode::InsufficientAvailable);

    // Update balances
    user_token_account.available -= amount;
    user_token_account.frozen += amount;

    // Emit the freeze event
    emit!(FreezeEvent {
        sn,
        account,
        token: ctx.accounts.mint.key(),
        amount,
        user: ctx.accounts.user.key(),
    });
    Ok(())
}
