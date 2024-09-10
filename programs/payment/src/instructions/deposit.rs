use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};
use crate::utils::verify_signature;
use crate::errors::ErrorCode;
use crate::events::DepositEvent;
use crate::Deposit;

pub fn handler(
    ctx: Context<Deposit>,
    account: [u8; 32],
    amount: u64,
    frozen: u64,
    sn: [u8; 32],
    expired_at: i64,
    signature: [u8; 64],
) -> Result<()> {
    require!(ctx.accounts.payment_state.enabled, ErrorCode::Disabled);
    require!(amount > 0 || frozen > 0, ErrorCode::ZeroAmount);

    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

    let message = [&account[..], &amount.to_le_bytes(), &frozen.to_le_bytes(), &sn[..], &expired_at.to_le_bytes()].concat();
    let public_key = ctx.accounts.payment_state.signer.as_ref();

    verify_signature(
        &ctx.accounts.ed25519_program,
        public_key,
        &message,
        &signature
    )?;
    
    // Check if the transaction has already been executed
    require!(!ctx.accounts.record.executed, ErrorCode::AlreadyExecuted);
    ctx.accounts.record.executed = true;

    // Transfer tokens
    if amount > 0 { 
      if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
          _handler_sol(&ctx, amount)?;
      } else {
          _handler_token(&ctx, amount)?;
      }
    }

    // Update user_token_account
    let user_token_account = &mut ctx.accounts.user_token_account;
    user_token_account.available = user_token_account.available.checked_add(amount).unwrap();
    user_token_account.available = user_token_account.available.checked_sub(frozen).ok_or(ErrorCode::InsufficientAvailable)?;
    user_token_account.frozen = user_token_account.frozen.checked_add(frozen).unwrap();
    if user_token_account.mint == Pubkey::default() {
        user_token_account.mint = ctx.accounts.mint.key();
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


pub fn _handler_sol(
    ctx: &Context<Deposit>,
    amount: u64,
) -> Result<()> {
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
    Ok(())
}

pub fn _handler_token(
    ctx: &Context<Deposit>,
    amount: u64,
) -> Result<()> {
    // Check if the program token is initialized
    let program_token = TokenAccount::try_deserialize(&mut &ctx.accounts.program_token.data.borrow()[..])?;
    require!(program_token.mint == ctx.accounts.mint.key(), ErrorCode::InvalidProgramToken);

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
    Ok(())
}