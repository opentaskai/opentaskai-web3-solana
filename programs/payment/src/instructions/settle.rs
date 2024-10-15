use anchor_lang::prelude::*;
use crate::utils::{verify_ed25519_instruction, transfer_sol, transfer_token, get_ata_owner_from_unchecked_account};
use crate::errors::ErrorCode;
use crate::events::SettleEvent;
use crate::Settlement;
use crate::state::{SettlementData};
use solana_program::pubkey::Pubkey;

pub fn handler(
    ctx: Context<Settlement>,
    sn: [u8; 32],
    deal: SettlementData,
    expired_at: i64,
    signature: [u8; 64],
) -> Result<()> {
    // Check if the record already exists
    require!(ctx.accounts.record.executed == false, ErrorCode::AlreadyExecuted);
    // Check if the request is expired
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

    require!(
        deal.available + deal.frozen == deal.amount + deal.fee && 
        deal.amount + deal.fee > 0 && 
        deal.paid >= deal.frozen + deal.excess_fee && 
        deal.frozen >= deal.excess_fee, ErrorCode::InvalidParameter
    );

    let message = [
        &sn[..], &deal.to_bytes()[..], &expired_at.to_le_bytes(),
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

    if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
        require!(ctx.accounts.fee_user.key() == ctx.accounts.payment_state.fee_to, ErrorCode::InvalidFeeUser);
    } else {
        let fee_user_owner = get_ata_owner_from_unchecked_account(&ctx.accounts.fee_user)?;
        require!(fee_user_owner == ctx.accounts.payment_state.fee_to, ErrorCode::InvalidFeeUser); 
    }

    // Mark the record as executed
    ctx.accounts.record.executed = true;

    let from_account = &mut ctx.accounts.from_token_account;
    
    if from_account.mint == Pubkey::default() {
        from_account.mint = ctx.accounts.mint.key();
    }

    if deal.available > 0 {
        require!(from_account.available >= deal.available, ErrorCode::InsufficientAvailable);
        from_account.available = from_account.available.checked_sub(deal.available).unwrap();
    }
    
    if deal.frozen > 0 {
        require!(from_account.frozen >= deal.frozen, ErrorCode::InsufficientFrozen);
        from_account.frozen = from_account.frozen.checked_sub(deal.frozen).unwrap();
        // if paid greater than 'frozen', it indicates that the excess amount needs to be unfrozen
        if deal.paid > deal.frozen {
            let excess_amount = deal.paid - deal.frozen;
            from_account.frozen -= excess_amount;
            from_account.available = from_account.available + excess_amount - deal.excess_fee; 
        }
    }

    // Settlement tokens
    let total_fee = deal.fee + deal.excess_fee;
    // Check if the 'out' account is not a zero address
    if ctx.accounts.out.key() != Pubkey::default() {
        if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
            if deal.amount > 0 {
                transfer_sol(
                    &ctx.accounts.program_token,
                    &ctx.accounts.out,
                    &ctx.accounts.system_program,
                    ctx.bumps.program_token,
                    deal.amount,
                )?;
            }
            if total_fee > 0 {
                transfer_sol(
                    &ctx.accounts.program_token,
                    &ctx.accounts.fee_user,
                    &ctx.accounts.system_program,
                    ctx.bumps.program_token,
                    total_fee,
                )?;
            }
        } else {
            if deal.amount > 0 {
                transfer_token(
                    &ctx.accounts.program_token,
                    &ctx.accounts.out,
                    &ctx.accounts.token_program,
                    &ctx.accounts.payment_state,
                    ctx.bumps.payment_state,
                    deal.amount,
                )?;
            }
            if total_fee > 0 {
                transfer_token(
                    &ctx.accounts.program_token,
                    &ctx.accounts.fee_user,
                    &ctx.accounts.token_program,
                    &ctx.accounts.payment_state,
                    ctx.bumps.payment_state,
                    total_fee,
                )?;
            }
        }
    } else {
        // If 'out' is a zero address, only update account funds
        if deal.amount > 0 {
            let to_account = &mut ctx.accounts.to_token_account;
            to_account.available += deal.amount;
        }
        if total_fee > 0 {
            let fee_account = &mut ctx.accounts.fee_token_account;
            fee_account.available += total_fee;
        }
    }

    // Emit transfer event
    emit!(SettleEvent {
        sn,
        token: ctx.accounts.mint.key(),
        from: deal.from,
        to: deal.to,
        out: ctx.accounts.out.key(),
        fee_user: ctx.accounts.fee_user.key(),
        available: deal.available,
        frozen: deal.frozen,
        amount: deal.amount,
        fee: deal.fee,
        paid: deal.paid,
        excess_fee: deal.excess_fee,
        user: ctx.accounts.user.key(),
    });

    Ok(())
}
