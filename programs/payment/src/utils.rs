use anchor_lang::prelude::*;
use crate::errors::ErrorCode;
use solana_program::ed25519_program::ID as ED25519_PROGRAM_ID;
use solana_program::instruction::Instruction;

#[cfg(feature = "test")]
pub fn verify_signature(
    _public_key: &[u8],
    _message: &[u8],
    _signature: &[u8]
) -> Result<()> {
    msg!("Signature verification skipped in test mode");
    Ok(())
}

#[cfg(not(feature = "test"))]
pub fn verify_signature(
    public_key: &[u8],
    message: &[u8],
    signature: &[u8]
) -> Result<()> {
    msg!("Verifying ed25519 signature");

    let ix = ed25519_instruction(public_key, message, signature);

    // Invoke the ed25519 program
    solana_program::program::invoke(
        &ix,
        &[]
    ).map_err(|_| error!(ErrorCode::InvalidSignature))?;

    msg!("Signature verified successfully");
    Ok(())
}

fn ed25519_instruction(public_key: &[u8], message: &[u8], signature: &[u8]) -> Instruction {
    let mut instruction_data = vec![0u8]; // Instruction type: Verify
    instruction_data.extend_from_slice(&(public_key.len() as u16).to_le_bytes());
    instruction_data.extend_from_slice(&(signature.len() as u16).to_le_bytes());
    instruction_data.extend_from_slice(&(message.len() as u16).to_le_bytes());
    instruction_data.extend_from_slice(public_key);
    instruction_data.extend_from_slice(signature);
    instruction_data.extend_from_slice(message);

    Instruction {
        program_id: ED25519_PROGRAM_ID,
        accounts: vec![],
        data: instruction_data,
    }
}