use anchor_lang::prelude::*;
use anchor_spl::token::{self, InitializeAccount};
use crate::{InitializeProgramToken, ChangeOwner};
use crate::errors::ErrorCode;

pub fn initialize_program_token(ctx: Context<InitializeProgramToken>) -> Result<()> {
    require!(ctx.accounts.owner.key() == ctx.accounts.payment_state.owner, ErrorCode::Unauthorized);
    if ctx.accounts.mint.key() == token::spl_token::native_mint::id() {
        // For SOL, we don't need to do anything extra as the SystemAccount is already initialized
    } else {
        // Manually initialize the token account
        token::initialize_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            InitializeAccount {
                account: ctx.accounts.program_token.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.payment_state.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            &[&[
                b"program-token",
                ctx.accounts.mint.key().as_ref(),
                &[ctx.bumps.program_token],
            ]],
        ))?;
    }
    Ok(())
}

pub fn change_owner(ctx: Context<ChangeOwner>) -> Result<()> {
    require!(ctx.accounts.current_owner.key() == ctx.accounts.payment_state.owner, ErrorCode::Unauthorized);
    ctx.accounts.payment_state.owner = ctx.accounts.new_owner.key();
    Ok(())
}

pub fn change_signer(ctx: Context<ChangeOwner>) -> Result<()> {
    require!(ctx.accounts.current_owner.key() == ctx.accounts.payment_state.owner || ctx.accounts.current_owner.key() == ctx.accounts.payment_state.signer, ErrorCode::Unauthorized);
    ctx.accounts.payment_state.signer = ctx.accounts.new_owner.key();
    Ok(())
}

pub fn change_fee_to(ctx: Context<ChangeOwner>) -> Result<()> {
    require!(ctx.accounts.current_owner.key() == ctx.accounts.payment_state.owner || ctx.accounts.current_owner.key() == ctx.accounts.payment_state.fee_to, ErrorCode::Unauthorized);
    ctx.accounts.payment_state.fee_to = ctx.accounts.new_owner.key();
    Ok(())
}
