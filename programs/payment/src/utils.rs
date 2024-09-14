use anchor_lang::prelude::*;
use crate::errors::ErrorCode;
use solana_program::ed25519_program;
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

    let instruction = new_ed25519_instruction(public_key, message, signature);
    
    // Invoke the ed25519 program
    solana_program::program::invoke(
        &instruction,
        &[]
    ).map_err(|_| error!(ErrorCode::InvalidSignature))?;

    msg!("Signature verified successfully");
    Ok(())
}

fn new_ed25519_instruction(public_key: &[u8], message: &[u8], signature: &[u8]) -> Instruction {
    let mut instruction_data = vec![1u8, 0u8]; // num_signatures = 1, padding
    
    let offsets = Ed25519SignatureOffsets {
        signature_offset: 2 + 64,
        signature_instruction_index: 0,
        public_key_offset: 2 + 64 + 64,
        public_key_instruction_index: 0,
        message_data_offset: 2 + 64 + 64 + 32,
        message_data_size: message.len() as u16,
        message_instruction_index: 0,
    };

    instruction_data.extend_from_slice(&offsets.try_to_vec().unwrap());
    instruction_data.extend_from_slice(signature);
    instruction_data.extend_from_slice(public_key);
    instruction_data.extend_from_slice(message);

    msg!("ed25519_program::id: {:?}", ed25519_program::id());
    Instruction {
        program_id: ed25519_program::id(),
        accounts: vec![],
        data: instruction_data,
    }
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct Ed25519SignatureOffsets {
    signature_offset: u16,
    signature_instruction_index: u16,
    public_key_offset: u16,
    public_key_instruction_index: u16,
    message_data_offset: u16,
    message_data_size: u16,
    message_instruction_index: u16,
}