use anchor_lang::prelude::*;
use anchor_spl::token::{self, InitializeAccount};
use crate::InitializeProgramToken;

pub fn handler(ctx: Context<InitializeProgramToken>) -> Result<()> {
    if ctx.accounts.mint.key() == token::spl_token::native_mint::id() {
        msg!("Initializing program token for SOL");
        msg!("Program token owner: {:?}", ctx.accounts.program_token.owner);
        // For SOL, we don't need to do anything extra as the SystemAccount is already initialized
    } else {
        msg!("Initializing program token for SPL token");
        msg!("Program token owner: {:?}", ctx.accounts.program_token.owner);
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