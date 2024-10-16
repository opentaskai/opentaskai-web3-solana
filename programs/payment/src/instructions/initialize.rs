use anchor_lang::prelude::*;
use crate::Initialize;

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let payment_state = &mut ctx.accounts.payment_state;
    payment_state.owner = ctx.accounts.owner.key();
    payment_state.enabled = true;
    payment_state.nosn_enabled = false;
    payment_state.signer = ctx.accounts.owner.key();
    payment_state.fee_to = ctx.accounts.owner.key();
    payment_state.bump = ctx.bumps.payment_state;

    payment_state.fee_to_account = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01,
    ];
    
    Ok(())
}
