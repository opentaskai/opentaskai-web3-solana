
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { v4 } from 'uuid';

export async function identifySolanaNetwork(connection: Connection): Promise<string> {
  try {
    const genesisHash = await connection.getGenesisHash();
    const slot = await connection.getSlot();

    switch (genesisHash) {
      case "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d":
        return "mainnet";
      case "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY":
        return "testnet";
      case "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG":
        return "devnet";
      default:
        // For Localnet or custom networks
        if (slot === 0) {
          return "Localnet";
        } else {
          return "Unknown Network";
        }
    }
  } catch (error) {
    console.error("Error identifying Solana network:", error);
    return "Error";
  }
}

export async function airdrop(payerKeypair: Keypair, connection: Connection, amount: number) {
  // Airdrop some SOL to the token creator if needed
  try {
    const balance = await connection.getBalance(payerKeypair.publicKey);
    console.log(payerKeypair.publicKey.toBase58()," Balance:", balance);
    if (balance < amount) {
      console.log(`Airdropping ${amount} SOL...`);
      const airdropSignature = await connection.requestAirdrop(
        payerKeypair.publicKey,
        amount
      );
      await connection.confirmTransaction(airdropSignature);
    }
  } catch (error) {
    console.error(`Error fetching ${payerKeypair.publicKey} balance:`, error);
    throw error;
  }
}

export function getDataFromTransaction(tx: any, programId: string, instruction: string) {
  // Verify that the transaction includes an instruction with your program ID
  const isProgramIdPresent = tx.transaction.message.instructions.some(instruction => {
    const programIdIndex = instruction.programIdIndex;
    const _programId = tx.transaction.message.accountKeys[programIdIndex];
    // console.log('check program id:', _programId.toBase58(), programId);
    return _programId.toBase58() === programId;
  });

  if (!isProgramIdPresent) {
    throw new Error("Transaction does not include the expected program ID");
  }

  if(tx && tx.meta && tx.meta.logMessages) {
    const findProgram = tx.meta.logMessages[tx.meta.logMessages.length-1] === `Program ${programId} success`;
    if(!findProgram) {
      throw new Error('not found programId:' + programId);
    }
    
    const findInstruction = tx.meta.logMessages.find(log => log === 'Program log: Instruction: '+ instruction);
    if(!findInstruction) {
      throw new Error('not found instruction:' + instruction);
    }

    const programDataLog = tx.meta.logMessages.find(log => log.startsWith("Program data:"));
    return programDataLog.split("Program data: ")[1];
  }
  throw new Error('invalid transaction');
}

export function parseEventFromTransaction(tx: any, programId: string, instruction: string) {
  // console.log('tx:', JSON.stringify(tx));
  const programDataLog = getDataFromTransaction(tx, programId, instruction);
  // console.log('programDataLog:', programDataLog);
  const dataBuffer = Buffer.from(programDataLog, 'base64');
  // console.log("Raw dataBuffer:", dataBuffer);
  if (instruction === 'Deposit') {
    return {
      sn: dataBuffer.slice(8, 40), // First 32 bytes for sn
      account: dataBuffer.slice(40, 72), // Next 32 bytes for account
      token: new PublicKey(dataBuffer.slice(72, 104)), // Next 32 bytes for token
      amount: dataBuffer.readBigUInt64LE(104), // Next 8 bytes for amount
      frozen: dataBuffer.readBigUInt64LE(112), // Next 8 bytes for frozen
      user: new PublicKey(dataBuffer.slice(120, 152)), // Next 32 bytes for user
    };
  } else if (instruction === 'Withdraw') {
    return {
      sn: dataBuffer.slice(8, 40), // First 32 bytes for sn
      token: new PublicKey(dataBuffer.slice(40, 72)), // Next 32 bytes for token
      from: dataBuffer.slice(72, 104), // Next 32 bytes for from account
      to: new PublicKey(dataBuffer.slice(104, 136)), // Next 32 bytes for recepient
      available: dataBuffer.readBigUInt64LE(136), // Next 8 bytes for available
      frozen: dataBuffer.readBigUInt64LE(144), // Next 8 bytes for frozen
      user: new PublicKey(dataBuffer.slice(152, 184)), // Next 32 bytes for user
    };
  } else if (instruction === 'Freeze') {
    return {
      sn: dataBuffer.slice(8, 40), // First 32 bytes for sn
      account: dataBuffer.slice(40, 72), // Next 32 bytes for account
      token: new PublicKey(dataBuffer.slice(72, 104)), // Next 32 bytes for token
      amount: dataBuffer.readBigUInt64LE(104), // Next 8 bytes for amount
      user: new PublicKey(dataBuffer.slice(112, 144)), // Next 32 bytes for user
    };
  } else if (instruction === 'Unfreeze') {
    return {
      sn: dataBuffer.slice(8, 40), // First 32 bytes for sn
      account: dataBuffer.slice(40, 72), // Next 32 bytes for account
      token: new PublicKey(dataBuffer.slice(72, 104)), // Next 32 bytes for token
      amount: dataBuffer.readBigUInt64LE(104), // Next 8 bytes for amount
      fee: dataBuffer.readBigUInt64LE(112), // Next 8 bytes for fee
      user: new PublicKey(dataBuffer.slice(120, 152)), // Next 32 bytes for user
    };
  } else if (instruction === 'Transfer') {
    return {
      sn: dataBuffer.slice(8, 40), // First 32 bytes for sn
      token: new PublicKey(dataBuffer.slice(40, 72)), // Next 32 bytes for token
      from: dataBuffer.slice(72, 104), // Next 32 bytes for from account
      to: dataBuffer.slice(104, 136), // Next 32 bytes for to account
      out: new PublicKey(dataBuffer.slice(136, 168)), // Next 32 bytes for recepient
      fee_user: new PublicKey(dataBuffer.slice(168, 200)), // Next 32 bytes for fee_user
      amount: dataBuffer.readBigUInt64LE(200), // Next 8 bytes for amount
      fee: dataBuffer.readBigUInt64LE(208), // Next 8 bytes for fee
      user: new PublicKey(dataBuffer.slice(216, 248)), // Next 32 bytes for user
    };
  } else if (instruction === 'Settle') {
    return {
      sn: dataBuffer.slice(8, 40), // First 32 bytes for sn
      token: new PublicKey(dataBuffer.slice(40, 72)), // Next 32 bytes for token
      from: dataBuffer.slice(72, 104), // Next 32 bytes for from account
      to: dataBuffer.slice(104, 136), // Next 32 bytes for to account
      out: new PublicKey(dataBuffer.slice(136, 168)), // Next 32 bytes for recepient
      fee_user: new PublicKey(dataBuffer.slice(168, 200)), // Next 32 bytes for fee_user
      available: dataBuffer.readBigUInt64LE(200), // Next 8 bytes for available
      frozen: dataBuffer.readBigUInt64LE(208), // Next 8 bytes for frozen
      amount: dataBuffer.readBigUInt64LE(216), // Next 8 bytes for amount
      fee: dataBuffer.readBigUInt64LE(224), // Next 8 bytes for fee
      paid: dataBuffer.readBigUInt64LE(232), // Next 8 bytes for paid
      excess_fee: dataBuffer.readBigUInt64LE(240), // Next 8 bytes for excess_fee
      user: new PublicKey(dataBuffer.slice(240, 272)), // Next 32 bytes for user
    };
  } else {
    return null;
  }
}

export function uuid(){
    return v4().replace(/-/g, '');
}

export function bytesBuffer(snHex: string|number) {
  snHex = String(snHex);
  return Buffer.from(snHex, 'hex');
}

export function bytes32Buffer(snHex: string|number) {
  snHex = String(snHex);
  const snBytes = Buffer.from(snHex, 'hex');
  const len = 32 - snBytes.length;
  let res = snBytes;
  if(len > 0) {
    res = Buffer.concat([Buffer.alloc(len), snBytes]); // Pad with 16 zeros at the beginning
  }
  // console.log('snHex, snBytes, bytes32Buffer:', snHex, snBytes, res);
  return res;
}

export function bufferToArray(buf: Buffer) {
  console.log('buf:', buf);
  const res = Array.from(buf).map(byte => byte);
  console.log('bufferToArray:', res);
  return res;
}