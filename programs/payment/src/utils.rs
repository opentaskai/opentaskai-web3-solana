use anchor_lang::prelude::*;
use crate::errors::ErrorCode;
use anchor_lang::system_program::System;
use anchor_spl::token::{self, Token};
use crate::state::{PaymentState};
use sha2::{Sha256, Digest};
// use solana_program::ed25519_program;
// use solana_program::instruction::Instruction;
use solana_program::sysvar::instructions::{load_instruction_at_checked, load_current_index_checked};

fn hash_sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

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
    let message_hash = hash_sha256(message);
    let msg_start = offsets.message_data_offset as usize;
    let msg_end = msg_start + offsets.message_data_size as usize;
    if &instruction_data[msg_start..msg_end] != message_hash {
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

pub fn transfer_sol<'info>(
    program_token: &UncheckedAccount<'info>,
    to: &UncheckedAccount<'info>,
    system_program: &Program<'info, System>,
    bump: u8,
    amount: u64,
) -> Result<()> {
    let mint_key = anchor_spl::token::spl_token::native_mint::id();
    let seeds = &[
        b"program-token",
        mint_key.as_ref(),
        &[bump],
    ];

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            program_token.key,
            to.key,
            amount,
        ),
        &[
            program_token.to_account_info(),
            to.to_account_info(),
            system_program.to_account_info(),
        ],
        &[seeds],
    )?;

    Ok(())
}

pub fn transfer_token<'info>(
    program_token: &UncheckedAccount<'info>,
    to: &UncheckedAccount<'info>,
    token_program: &Program<'info, Token>,
    authority: &Account<'info, PaymentState>,
    bump: u8,
    amount: u64,
) -> Result<()> {
    let seeds = &[
        b"payment-state".as_ref(),
        &[bump],
    ];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            token::Transfer {
                from: program_token.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
            },
            &[seeds],
        ),
        amount
    )?;
    Ok(())
}

// Public function to get the owner of the associated token account
pub fn get_ata_owner<'info>(user_account_info: &AccountInfo<'info>) -> Result<Pubkey> {
    let user_token_data = user_account_info.try_borrow_data()?; 

    // Extract the owner from the token account data
    let owner = Pubkey::try_from(&user_token_data[32..64])
        .map_err(|_| anchor_lang::error::Error::from(ErrorCode::InvalidATAOwner))?; // Use fully qualified path for conversion

    Ok(owner) // Return the owner
}

// Public function to get the owner of the associated token account from an UncheckedAccount
pub fn get_ata_owner_from_unchecked_account<'info>(ata_account: &UncheckedAccount<'info>) -> Result<Pubkey> {
    let user_account_info = ata_account.to_account_info(); 
    get_ata_owner(&user_account_info) // Pass a reference to user_account_info
}