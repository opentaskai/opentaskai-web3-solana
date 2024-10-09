use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct PaymentState {
    pub owner: Pubkey,
    pub enabled: bool,
    pub nosn_enabled: bool,
    pub signer: Pubkey,
    pub fee_to: Pubkey,
    pub fee_to_account: [u8; 32],
    pub bump: u8,
}

impl PaymentState {
    pub const LEN: usize = 32 + 1 + 1 + 32 + 32 + 32 + 1;
}

#[account]
#[derive(Default)]
pub struct UserTokenAccount {
    pub mint: Pubkey,
    pub available: u64,
    pub frozen: u64,
}

impl UserTokenAccount {
    pub const LEN: usize = 32 + 8 + 8;
}

#[account]
#[derive(Default)]
pub struct TransactionRecord {
    pub executed: bool,
}

impl TransactionRecord {
    pub const LEN: usize = 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransferData {
    pub from: [u8; 32], // Sender's account number.
    pub to: [u8; 32], // Recipient's account number
    pub available: u64, // Amount deducted from sender's available balance
    pub frozen: u64, // Amount deducted from sender's frozen balance
    pub amount: u64, // Amount transferred to recipient's account
    pub fee: u64, // Base fee for the transaction transferred to the fee account
    pub paid: u64, // Total amount paid by the sender, potentially including excess payment, which is frozen in the sender's account
    pub excess_fee: u64, // Additional fee charged if 'paid' exceeds 'frozen', transferred to the fee account
}

impl TransferData {
    pub fn to_bytes(&self) -> Vec<u8> {
        [
            &self.from[..],
            &self.to[..],
            &self.available.to_le_bytes(),
            &self.frozen.to_le_bytes(),
            &self.amount.to_le_bytes(),
            &self.fee.to_le_bytes(),
            &self.paid.to_le_bytes(),
            &self.excess_fee.to_le_bytes(),
        ]
        .concat()
    }
}