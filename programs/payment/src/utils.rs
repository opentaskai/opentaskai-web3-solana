use anchor_lang::prelude::*;
use crate::errors::ErrorCode;
// use solana_program::ed25519_program;
// use solana_program::instruction::Instruction;
use solana_program::sysvar::instructions::{load_instruction_at_checked, load_current_index_checked};


#[cfg(feature = "test")]
pub fn verify_ed25519_instruction(
    instruction_sysvar: &AccountInfo,
    expected_public_key: &[u8],
    message: &[u8],
    signature: &[u8]
) -> Result<()> {
    msg!("Signature verification skipped in test mode");
    Ok(())
}

#[cfg(not(feature = "test"))]
pub fn verify_ed25519_instruction(
    instruction_sysvar: &AccountInfo,
    expected_public_key: &[u8],
    message: &[u8],
    signature: &[u8]
) -> Result<()> {
    let current_index = load_current_index_checked(instruction_sysvar)?;
    if current_index == 0 {
        return Err(ErrorCode::MissingEd25519Instruction.into());
    }

    let ed25519_instruction = load_instruction_at_checked((current_index - 1) as usize, instruction_sysvar)?;
    
    // Verify the content of the Ed25519 instruction
    let instruction_data = ed25519_instruction.data;
    if instruction_data.len() < 2 {
        return Err(ErrorCode::InvalidEd25519Instruction.into());
    }

    let num_signatures = instruction_data[0];
    if num_signatures != 1 {
        return Err(ErrorCode::InvalidEd25519Instruction.into());
    }

    // Parse Ed25519SignatureOffsets
    let offsets: Ed25519SignatureOffsets = Ed25519SignatureOffsets::try_from_slice(&instruction_data[2..16])?;

    // Verify public key
    let pubkey_start = offsets.public_key_offset as usize;
    let pubkey_end = pubkey_start + 32;
    if &instruction_data[pubkey_start..pubkey_end] != expected_public_key {
        return Err(ErrorCode::InvalidPublicKey.into());
    }

    // Verify message
    let msg_start = offsets.message_data_offset as usize;
    let msg_end = msg_start + offsets.message_data_size as usize;
    if &instruction_data[msg_start..msg_end] != message {
        return Err(ErrorCode::InvalidMessage.into());
    }

    // Verify signature
    let sig_start = offsets.signature_offset as usize;
    let sig_end = sig_start + 64;
    if &instruction_data[sig_start..sig_end] != signature {
        return Err(ErrorCode::InvalidSignature.into());
    }

    Ok(())
}

// pub fn create_ed25519_instruction(
//     public_key: &[u8],
//     message: &[u8],
//     signature: &[u8]
// ) -> Instruction {
//     let mut instruction_data = vec![1u8, 0u8]; // num_signatures = 1, padding
    
//     let offsets = Ed25519SignatureOffsets {
//         signature_offset: 2 + 64,
//         signature_instruction_index: 0,
//         public_key_offset: 2 + 64 + 64,
//         public_key_instruction_index: 0,
//         message_data_offset: 2 + 64 + 64 + 32,
//         message_data_size: message.len() as u16,
//         message_instruction_index: 0,
//     };

//     instruction_data.extend_from_slice(&offsets.try_to_vec().unwrap());
//     instruction_data.extend_from_slice(signature);
//     instruction_data.extend_from_slice(public_key);
//     instruction_data.extend_from_slice(message);

//     Instruction {
//         program_id: ed25519_program::id(),
//         accounts: vec![],
//         data: instruction_data,
//     }
// }

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