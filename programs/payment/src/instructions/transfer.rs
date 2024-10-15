use anchor_lang::prelude::*;
use crate::utils::{verify_ed25519_instruction, transfer_sol, transfer_token, get_ata_owner_from_unchecked_account};
use crate::errors::ErrorCode;
use crate::events::TransferEvent;
use crate::Transfer;

pub fn handler(
    ctx: Context<Transfer>,
    sn: [u8; 32],
    from: [u8; 32],
    to: [u8; 32],
    amount: u64,
    fee: u64,
    expired_at: i64,
    signature: [u8; 64],
) -> Result<()> {
    // Check if the record already exists
    require!(ctx.accounts.record.executed == false, ErrorCode::AlreadyExecuted);
    // Check if the request is expired
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

    require!(amount > 0 && amount > fee, ErrorCode::InvalidParameter);

    let message = [
        &sn[..], &from[..], &to[..], &amount.to_le_bytes(), &fee.to_le_bytes(), &expired_at.to_le_bytes(),
        &ctx.accounts.user.key().to_bytes()[..],
        &ctx.accounts.mint.key().to_bytes()[..],
        &ctx.accounts.out.key().to_bytes()[..], 
        &ctx.accounts.fee_user.key().to_bytes()[..], 
    ].concat();
    verify_ed25519_instruction(
        &ctx.accounts.instruction_sysvar,
        ctx.accounts.payment_state.signer.as_ref(),
        &message,
        &signature,
    )?;

    // msg!("payment_state.fee_to: {}", ctx.accounts.payment_state.fee_to.to_string());
    if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
        // msg!("fee_user wallet: {}", ctx.accounts.fee_user.key().to_string());
        require!(ctx.accounts.fee_user.key() == ctx.accounts.payment_state.fee_to, ErrorCode::InvalidFeeUser);
    } else {
        let fee_user_owner = get_ata_owner_from_unchecked_account(&ctx.accounts.fee_user)?;
        // msg!("fee_user_owner: {:?}", fee_user_owner);
        require!(fee_user_owner == ctx.accounts.payment_state.fee_to, ErrorCode::InvalidFeeUser); // Added usage of fee_user_token_account
    }

    // Mark the record as executed
    ctx.accounts.record.executed = true;

    let from_token_account = &mut ctx.accounts.from_token_account;
    require!(from_token_account.available >= amount, ErrorCode::InsufficientAvailable);

    from_token_account.available = from_token_account.available.checked_sub(amount).unwrap();

    // Check if the 'out' account is not a zero address
    let to_amount = amount - fee;
    if ctx.accounts.out.key() != Pubkey::default() {
        if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
            if amount > 0 {
                transfer_sol(
                    &ctx.accounts.program_token,
                    &ctx.accounts.out,
                    &ctx.accounts.system_program,
                    ctx.bumps.program_token,
                    to_amount,
                )?;
            }
            if fee > 0 {
                transfer_sol(
                    &ctx.accounts.program_token,
                    &ctx.accounts.fee_user,
                    &ctx.accounts.system_program,
                    ctx.bumps.program_token,
                    fee,
                )?;
            }
        } else {
            if amount > 0 {
                transfer_token(
                    &ctx.accounts.program_token,
                    &ctx.accounts.out,
                    &ctx.accounts.token_program,
                    &ctx.accounts.payment_state,
                    ctx.bumps.payment_state,
                    to_amount,
                )?;
            }
            if fee > 0 {
                transfer_token(
                    &ctx.accounts.program_token,
                    &ctx.accounts.fee_user,
                    &ctx.accounts.token_program,
                    &ctx.accounts.payment_state,
                    ctx.bumps.payment_state,
                    fee,
                )?;
            }
        }
    } else {
        // If 'out' is a zero address, only update account funds
        let to_token_account = &mut ctx.accounts.to_token_account;
        to_token_account.available += to_amount;

        if fee > 0 {
            let fee_token_account = &mut ctx.accounts.fee_token_account;
            fee_token_account.available += fee;
        }
    }

    // Emit Transfer event
    emit!(TransferEvent {
        sn,
        token: ctx.accounts.mint.key(),
        from,
        to,
        out: ctx.accounts.out.key(),
        fee_user: ctx.accounts.fee_user.key(),
        amount,
        fee,
        user: ctx.accounts.user.key(),
    });
    Ok(())
}
