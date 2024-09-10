use anchor_lang::prelude::*;
use solana_program::ed25519_program;
use solana_program::instruction::{Instruction, AccountMeta};
use crate::errors::ErrorCode;

#[cfg(feature = "test")]
pub fn verify_signature(
    _ed25519_program: &AccountInfo,
    _public_key: &[u8],
    _message: &[u8],
    _signature: &[u8]
) -> Result<()> {
    msg!("Signature verification skipped in test mode");
    Ok(())
}

#[cfg(not(feature = "test"))]
pub fn verify_signature(
    ed25519_program: &AccountInfo,
    public_key: &[u8],
    message: &[u8],
    signature: &[u8]
) -> Result<()> {
    msg!("Invoking ed25519 program for signature verification");

    let instruction_data = [
        0, // Instruction index for ed25519 verification
        64, // signature length (always 64 for ed25519)
        32, // public key length (always 32 for ed25519)
        message.len() as u8,
    ]
    .iter()
    .chain(signature.iter())
    .chain(public_key.iter())
    .chain(message.iter())
    .copied()
    .collect::<Vec<u8>>();

    msg!("Instruction data length: {}", instruction_data.len());

    let instruction = Instruction::new_with_bytes(
        ed25519_program::id(),
        &instruction_data,
        vec![AccountMeta::new_readonly(ed25519_program.key(), false)],
    );

    solana_program::program::invoke(
        &instruction,
        &[ed25519_program.to_account_info()],
    ).map_err(|err| {
        msg!("Signature verification failed: {:?}", err);
        ErrorCode::InvalidSignature
    })?;

    msg!("Signature verified successfully");
    Ok(())
}