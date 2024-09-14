import nacl from 'tweetnacl';
import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { Payment } from "../target/types/payment";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Ed25519Program
} from "@solana/web3.js";
import * as secp256k1 from 'secp256k1';
import { keccak256 } from 'js-sha3';
import { getTokenAccountBalance, getAccountBalance } from "../scripts/tokens";

export async function getTransactionFee(provider: anchor.AnchorProvider, txSignature: string) {
  // Fetch the transaction to get the exact fee (with retry logic)
  let txDetails = null;
  let retries = 5;
  while (retries > 0 && txDetails === null) {
    txDetails = await provider.connection.getTransaction(txSignature, { commitment: 'confirmed' });
    if (txDetails === null) {
      console.log(`Transaction details not found, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 seconds before retrying
      retries--;
    }
  }

  if (txDetails === null) {
    throw new Error("Failed to fetch transaction details after multiple attempts");
  }

  return txDetails.meta.fee;
}


export async function showUserTokenAccount(
  info: any,
  userAccountPDA: anchor.web3.PublicKey,
  mark: string = ""
) {
  const result = {
    account: userAccountPDA.toBase58(),
    available: info.available.toString(),
    frozen: info.frozen.toString(),
  };
  console.log(mark, result);
}

export function signMessageForEd25519(message: Buffer, signerKeypair: Keypair) {
  const signature = nacl.sign.detached(message, signerKeypair.secretKey);
  console.log("Signature:", signature);
  return signature;
}

export function signMessageForSecp256k1(message: Buffer, signerKeypair: Keypair) {
  const messageHash = Buffer.from(keccak256.array(message));
  const privateKey = signerKeypair.secretKey.slice(0, 32);
  const { signature, recid } = secp256k1.ecdsaSign(messageHash, privateKey);
  console.log("Signature:", Buffer.from(signature).toString('hex'));
  console.log("Recid:", recid);
  
  const fullSignature = Buffer.concat([Buffer.from(signature), Buffer.from([recid])]);
  
  const publicKey = secp256k1.publicKeyCreate(privateKey, false);
  const ethAddress = Buffer.from(keccak256(publicKey.slice(1)), 'hex').slice(-20);
  
  console.log("Message:", message.toString('hex'));
  console.log("Message hash:", messageHash.toString('hex'));
  console.log("Signature:", fullSignature.toString('hex'));
  console.log("Ethereum address:", ethAddress.toString('hex'));
  console.log("Solana public key:", signerKeypair.publicKey.toBase58());
  
  return fullSignature;
}

export async function depositSol(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  account: number[],
  sn: number[],
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN
) {
  // Create and sign the message
  const message = Buffer.concat([
    Buffer.from(account),
    amount.toArrayLike(Buffer, 'le', 8),
    frozen.toArrayLike(Buffer, 'le', 8),
    Buffer.from(sn),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);
  return deposit(provider, program, payerKeypair, payerKeypair, spl.NATIVE_MINT, account, sn, amount, frozen, expiredAt, message);
}

export async function depositTokens(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  mint: PublicKey,
  account: number[],
  sn: number[],
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN
) {
  // Create and sign the message
  const message = Buffer.concat([
    Buffer.from(account),
    amount.toArrayLike(Buffer, 'le', 8),
    frozen.toArrayLike(Buffer, 'le', 8),
    Buffer.from(sn),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);
  return deposit(provider, program, payerKeypair, payerKeypair, mint, account, sn, amount, frozen, expiredAt, message);
}


export async function deposit(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  account: number[],
  sn: number[],
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN,
  message: Buffer
) {
  // Derive the payment state account PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    program.programId
  );

  // Derive the user token account PDA
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), Buffer.from(account), mint.toBuffer()],
    program.programId
  );

  // Derive the program token account PDA
  const [programTokenPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-token"), mint.toBuffer()],
    program.programId
  );

  // Derive the record account PDA
  const [recordPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), Buffer.from(sn)],
    program.programId
  );

  // console.log("Payment State:", paymentStateKeypair.publicKey.toBase58());
  console.log("User Token Account PDA:", userAccountPDA.toBase58());
  console.log("Program Token PDA:", programTokenPDA.toBase58());
  console.log("Mint:", mint.toBase58());
  console.log("Record:", recordPubkey.toBase58());

  let tokenAccount = payerKeypair.publicKey;
  if (mint.toBase58() !== "So11111111111111111111111111111111111111112") {
    // Ensure user token account exists and is an associated token account
    const userTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerKeypair,
      mint,
      payerKeypair.publicKey
    );
    tokenAccount = userTokenAccount.address;
  }
  console.log("User token account:", tokenAccount.toBase58());

  const userTokenBalance = await getTokenAccountBalance(provider.connection, mint, payerKeypair.publicKey);
  console.log("User Token Balance before deposit:", userTokenBalance);

  const programTokenAccountBefore = await getAccountBalance(provider.connection, mint, programTokenPDA);
  console.log("Program token account before deposit:", programTokenAccountBefore);
  const signature = signMessageForEd25519(message, signerKeypair);
  try {
    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    });
    
    const tx = await program.methods
    .deposit(account, amount, frozen, sn, expiredAt, signature)
    .accounts({
      paymentState: paymentStatePDA,
      userTokenAccount: userAccountPDA,
      user: payerKeypair.publicKey,
      userToken: tokenAccount,
      programToken: programTokenPDA,
      mint: mint,
      record: recordPubkey,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .preInstructions([ed25519Instruction])
    .signers([payerKeypair])
    .rpc();

    console.log("Transaction signature:", tx);
    const txResult = await provider.connection.confirmTransaction(tx, 'confirmed');
    if (txResult.value.err) {
      console.error("Transaction failed:", txResult.value.err);
      throw new Error("Transaction failed");
    }

    const programTokenAccountAfter = await getAccountBalance(provider.connection, mint, programTokenPDA);
    console.log("Program token account after deposit:", programTokenAccountAfter);

    // Log balances after deposit
    const userTokenBalanceAfter = await getTokenAccountBalance(provider.connection, mint, payerKeypair.publicKey);
    console.log(
      "User Token Balance after deposit:",
      userTokenBalanceAfter
    );
    const userTokenAccountInfo = await program.account.userTokenAccount.fetch(
      userAccountPDA
    );
    showUserTokenAccount(
      userTokenAccountInfo,
      userAccountPDA,
      "User Token Account: "
    );
    

    return {
      userAccountPDA,
      userTokenAccountInfo,
      userTokenBalanceAfter,
      programTokenAccountAfter,
    };
  } catch (error) {
    console.error("Deposits tokens Error details:", error);
    if (error instanceof anchor.AnchorError) {
      console.log("Error code:", error.error.errorCode.code);
      console.log("Error msg:", error.error.errorMessage);
    }
    throw error;
  }
}