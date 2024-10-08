
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
    console.log("Balance:", balance);
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
    const findInstruction = tx.meta.logMessages.find(log => log === 'Program log: Instruction: '+ instruction);
    if(findProgram && findInstruction) {
      const programDataLog = tx.meta.logMessages.find(log => log.startsWith("Program data:"));
      return programDataLog.split("Program data: ")[1];
    }
  }
  throw new Error('not found program data');
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
      amount: dataBuffer.readBigUInt64LE(104), // Adjusted offset for amount
      frozen: dataBuffer.readBigUInt64LE(112), // Adjusted offset for frozen
      user: new PublicKey(dataBuffer.slice(120, 152)), // Next 32 bytes for user
    };
  } else if (instruction === 'Withdraw') {
    return {
      sn: dataBuffer.slice(8, 40), // First 32 bytes for sn
      token: new PublicKey(dataBuffer.slice(40, 72)), // Next 32 bytes for token
      from: dataBuffer.slice(72, 104), // Next 32 bytes for from account
      to: new PublicKey(dataBuffer.slice(104, 136)), // Next 32 bytes for token
      available: dataBuffer.readBigUInt64LE(136), // Adjusted offset for available
      frozen: dataBuffer.readBigUInt64LE(144), // Adjusted offset for frozen
      user: new PublicKey(dataBuffer.slice(152, 184)), // Next 32 bytes for user
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