use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};
use crate::utils::verify_ed25519_instruction;
use crate::errors::ErrorCode;
use crate::events::TransferEvent;
use crate::Transfer;
use crate::state::{TransferData};

pub fn handler(
    ctx: Context<Transfer>,
    out: Pubkey,
    deal: TransferData,
    sn: [u8; 32],
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

    let message = [&out.to_bytes()[..], &deal.to_bytes()[..], &sn[..], &expired_at.to_le_bytes()].concat();
    verify_ed25519_instruction(
        &ctx.accounts.instruction_sysvar,
        ctx.accounts.payment_state.signer.as_ref(),
        &message,
        &signature,
    )?;

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

    // Transfer tokens
    let total_fee = deal.fee + deal.excess_fee;
    if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
        if deal.amount > 0 {
            _handler_sol(&ctx, deal.amount)?;
        }
        if total_fee > 0 {
            _handler_sol(&ctx, total_fee)?;
        }
    } else {
        if deal.amount > 0 {
            _handler_token(&ctx, deal.amount)?;
        }
        if total_fee > 0 {
            _handler_token(&ctx, total_fee)?;
        }
    }

    // Emit transfer event
    emit!(TransferEvent {
        sn,
        token: ctx.accounts.mint.key(),
        from: deal.from,
        to: deal.to,
        out: ctx.accounts.out.key(),
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

fn _handler_sol(ctx: &Context<Transfer>, amount: u64) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[
        b"program-token",
        mint_key.as_ref(),
        &[ctx.bumps.program_token],
    ];

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.program_token.key,
            ctx.accounts.out.key,
            amount,
        ),
        &[
            ctx.accounts.program_token.to_account_info(),
            ctx.accounts.out.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[seeds],
    )?;

    Ok(())
}

fn _handler_token(ctx: &Context<Transfer>, amount: u64) -> Result<()> {
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
                to: ctx.accounts.out.to_account_info(),
                authority: ctx.accounts.payment_state.to_account_info(),
            },
            &[seeds],
        ),
        amount
    )?;
    Ok(())
}
