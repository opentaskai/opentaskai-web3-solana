use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};
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
) -> Result<()> {
    msg!("Deposit handler started");
    require!(ctx.accounts.payment_state.enabled, ErrorCode::Disabled);
    require!(amount > frozen, ErrorCode::InvalidAmount);

    msg!("Checking program token");
    // Check if the program token is initialized
    if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
        msg!("SOL deposit");
        // For SOL, we don't need to deserialize the program_token
    } else {
        msg!("SPL Token deposit");
        let program_token = TokenAccount::try_deserialize(&mut &ctx.accounts.program_token.data.borrow()[..])?;
        require!(program_token.mint == ctx.accounts.mint.key(), ErrorCode::InvalidProgramToken);
    }

    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expired_at, ErrorCode::Expired);

    // Check if the transaction has already been executed
    require!(!ctx.accounts.record.executed, ErrorCode::AlreadyExecuted);
    ctx.accounts.record.executed = true;

    msg!("User token account: {}", ctx.accounts.user_token.key());
    msg!("Program token account: {}", ctx.accounts.program_token.key());
    msg!("Amount to transfer: {}", amount);

    // Update user_token_account
    let user_token_account = &mut ctx.accounts.user_token_account;
    user_token_account.available = user_token_account.available.checked_add(amount - frozen).unwrap();
    user_token_account.frozen = user_token_account.frozen.checked_add(frozen).unwrap();

    if user_token_account.mint == Pubkey::default() {
        user_token_account.mint = ctx.accounts.mint.key();
    }

    msg!("Transferring tokens");
    // Transfer tokens
    if ctx.accounts.mint.key() == anchor_spl::token::spl_token::native_mint::id() {
        // SOL transfer
        msg!("Transferring SOL");
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
        msg!("Transferring SPL Token");
        let transfer_result = token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.program_token.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        );

        match transfer_result {
            Ok(_) => msg!("Token transfer successful"),
            Err(e) => {
                msg!("Token transfer failed: {:?}", e);
                return Err(e.into());
            }
        }
    }

    msg!("Emitting deposit event");
    // Emit the deposit event
    emit!(DepositEvent {
        sn,
        account,
        token: ctx.accounts.mint.key(),
        amount,
        frozen,
    });

    msg!("Deposit handler completed successfully");
    Ok(())
}
