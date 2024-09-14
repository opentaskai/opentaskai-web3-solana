import * as web3 from "@solana/web3.js";
import * as token from "@solana/spl-token";
import fs from 'fs';
import os from 'os';
import path from 'path';

import {identifySolanaNetwork} from './utils';
import {getContract, setContract} from './accounts';


export async function deployToken(connection: web3.Connection, payerKeypair: web3.Keypair = null) {
  // console.log("Connection:", connection);
  const network = await identifySolanaNetwork(connection);
  console.log("Network:", network);

  const contract = await getContract(); 
  if(contract[network]) {
    console.log("Contract already exists:", contract[network]);
    return new web3.PublicKey(contract[network].mint);
  } 

  // Get or create a payerKeypair for the token creator
  if(!payerKeypair) {
    const keypairFile = fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf-8');
    const keypairData = JSON.parse(keypairFile);
    payerKeypair = web3.Keypair.fromSecretKey(new Uint8Array(keypairData));
  }
  console.log("Payer payerKeypair:", payerKeypair.publicKey.toBase58());


  // Create new token mint
  const mint = await token.createMint(
    connection,
    payerKeypair,
    payerKeypair.publicKey,
    null,
    9 // 9 decimals
  );

  console.log("Token mint address:", mint.toBase58());


  // Save the mint address to a file
  await setContract(network, {
    mint: mint.toBase58(),
  }); 

  return mint;
}

export async function getTokenAccountBalance(connection: web3.Connection, mint: web3.PublicKey, owner: web3.PublicKey) {
  try {
    if (mint.toBase58() === token.NATIVE_MINT.toBase58()) {
      const balance = await connection.getBalance(owner);
      return BigInt(balance);
    } else {
      // Find the associated token account address
      const associatedTokenAddress = await token.getAssociatedTokenAddress(
        mint,
        owner
      );
      // Attempt to get the token account balance
      const balance = await connection.getTokenAccountBalance(associatedTokenAddress);
      return BigInt(balance.value.amount);
    }
  } catch (error) {
    if (error.message.includes("Account does not exist")) {
      console.log("Token account does not exist");
      return 0;
    } else {
      // Re-throw other errors
      console.error("getTokenAccountBalance Error:", error);
      throw error;
    }
  }
}

export async function getAccountBalance(connection: web3.Connection, mint: web3.PublicKey, owner: web3.PublicKey) {
  try {
      if(mint.toBase58() === token.NATIVE_MINT.toBase58()) {
      const balance = await connection.getBalance(owner);
      console.log("SOL Balance:", balance);
      return BigInt(balance);
    } else {
      const balance = await token.getAccount(connection, owner);
      console.log("Token Balance:", balance);
      return BigInt(balance.amount);
    }
  } catch (error) {
    if (error.message.includes("Account does not exist")) {
      console.log("Token account does not exist");
      return 0;
    } else {
      // Re-throw other errors
      console.error("getAccountBalance Error:", error);
      throw error;
    }
  }
}

async function main() {
  // Connect to devnet
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"), "confirmed");
  const res = await deployToken(connection);
  console.log(res);
}

// main().catch(console.error);