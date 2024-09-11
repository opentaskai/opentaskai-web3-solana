import fs from 'fs';
import os from 'os';
import path from 'path';
import { Keypair } from '@solana/web3.js';


const AccountFile = path.join(__dirname, '../accounts.json');

export async function getContract() {
  if(!fs.existsSync(AccountFile)) {
    return {};
  }
  const contractFile = fs.readFileSync(AccountFile, 'utf-8');
  const contract = JSON.parse(contractFile);
  return contract;
}

export async function setContract(net:string, data:any) {
  if(!["mainnet", "testnet", "devnet"].includes(net)) {
    return;
  }
  const contract = await getContract();
  contract[net] = data;
  fs.writeFileSync(AccountFile, JSON.stringify(contract, null, 2));
}

export async function getBase58PublicKey(keypairPath:string) {
  const keypairJson = fs.readFileSync(keypairPath, 'utf-8');
  const keypairData = JSON.parse(keypairJson);
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  return keypair.publicKey.toBase58();
}

const args = process.argv.slice(2);
console.log(args);
if(args.length > 0) {
  getBase58PublicKey(args[0]).then(console.log).catch(console.error);
}