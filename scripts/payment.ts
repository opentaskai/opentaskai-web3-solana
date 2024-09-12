import * as web3 from "@solana/web3.js";
import fs from 'fs';
import os from 'os';
import path from 'path';

import { identifySolanaNetwork } from './utils';
import { getContract, setContract } from './accounts';

const BPF_LOADER_PROGRAM_ID = new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export async function isPaymentDeployed(connection: web3.Connection, payerKeypair: web3.Keypair = null) {
  const network = await identifySolanaNetwork(connection);
  console.log("Network:", network);

  let programId: web3.PublicKey = null;

  const contract = await getContract();
  if (contract[network] && contract[network].payment) {
    console.log("Payment program id:", contract[network].payment);
    programId = new web3.PublicKey(contract[network].payment);
  }

  // Get or create a payerKeypair for the program deployer
  if (!payerKeypair) {
    const keypairFile = fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf-8');
    const keypairData = JSON.parse(keypairFile);
    payerKeypair = web3.Keypair.fromSecretKey(new Uint8Array(keypairData));
  }
  console.log("Deployer public key:", payerKeypair.publicKey.toBase58());

  // Read the compiled program
  const programPath = path.resolve(__dirname, "../target/deploy/payment.so");
  const programData = fs.readFileSync(programPath);

  // Use the existing program ID
  let programInfo: web3.AccountInfo<any> = null;
  if (programId) {
    console.log("Using program ID:", programId.toBase58());
    programInfo = await connection.getAccountInfo(programId);
    console.log('programInfo', programInfo);
    // Check if the program is already deployed
    if (await isProgramDeployed(programInfo, programData.length)) {
      return true;
    }
  }

  return false;

  //todo: deploy program
}

async function isProgramDeployed(programInfo: web3.AccountInfo<any>, expectedDataLength: number): Promise<boolean> {
  if (!programInfo) {
    console.log("Program account does not exist.");
    return false;
  }
  
  if (!programInfo.owner.equals(BPF_LOADER_PROGRAM_ID)) {
    console.log("Program account is not owned by BPF Loader.");
    return false;
  }

  console.log("Program account is owned by BPF Loader.");
  // if (programInfo.data.length !== expectedDataLength) {
  //   console.log(`Program account data length (${programInfo.data.length}) does not match the expected length (${expectedDataLength}).`);
  //   return false;
  // }
  if (!programInfo.executable) {
    console.log("Program is not executable.");
    return false;
  }
  console.log("Program is deployed and executable.");
  return true;
}

async function main() {
  // Connect to devnet
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"), "confirmed");
  await isPaymentDeployed(connection);
}

// main().catch(console.error);