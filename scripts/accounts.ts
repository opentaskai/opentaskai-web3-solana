import fs from 'fs';
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

export function loadKeypair(keypairPath:string) {
  const keypairJson = fs.readFileSync(keypairPath, 'utf-8');
  const keypairData = JSON.parse(keypairJson);
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  return keypair;
}

export function getKeypair(keypairPath:string) {
  if(fs.existsSync(keypairPath)) {
    return loadKeypair(keypairPath);
  } else {
    return Keypair.generate();
  }
}

export function getBase58PublicKey(keypairPath:string) {
  const keypair = loadKeypair(keypairPath);
  return keypair.publicKey.toBase58();
}

const args = process.argv.slice(2);
console.log('accounts args:', args);
if(args.length > 0 && args[0] !== '-r') {
  console.log(getBase58PublicKey(args[0]));
}
