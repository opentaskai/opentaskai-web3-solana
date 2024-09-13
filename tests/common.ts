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
} from "@solana/web3.js";
import * as secp256k1 from 'secp256k1';
import { keccak256 } from 'js-sha3';
import { getTokenAccountBalance } from "../scripts/tokens";

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

export function signMessageForEd25519(message: Buffer, payerKeypair: Keypair) {
  const signature = nacl.sign.detached(message, payerKeypair.secretKey);
  console.log("Signature:", Buffer.from(signature).toString('hex'));
  return signature;
}

export function signMessageForSecp256k1(message: Buffer, payerKeypair: Keypair) {
  const messageHash = Buffer.from(keccak256.array(message));
  const privateKey = payerKeypair.secretKey.slice(0, 32);
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
  console.log("Solana public key:", payerKeypair.publicKey.toBase58());
  
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
  // Derive the payment state account PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    program.programId
  );

  // Derive the user token account PDA for SOL
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("user-token"),
      Buffer.from(account),
      spl.NATIVE_MINT.toBuffer(),
    ],
    program.programId
  );

  // Derive the program token account PDA for SOL
  const [programAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-token"), spl.NATIVE_MINT.toBuffer()],
    program.programId
  );

  // Derive the record account PDA
  const [recordPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), Buffer.from(sn)],
    program.programId
  );

  console.log("Payment State:", paymentStatePDA.toBase58());
  console.log("User SOL Account:", userAccountPDA.toBase58());
  console.log("Program SOL Account:", programAccountPDA.toBase58());
  console.log("Record:", recordPubkey.toBase58());

  const paymentStateAccount = await program.account.paymentState.fetch(paymentStatePDA);
  console.log("Payment state signer:", paymentStateAccount.signer.toBase58());

  // Log balance before deposit
  const userBalance = await provider.connection.getBalance(
    payerKeypair.publicKey
  );
  console.log(
    "User SOL Balance before deposit:",
    userBalance / LAMPORTS_PER_SOL
  );

  const userAccount = payerKeypair.publicKey;
  console.log("User account:", userAccount.toBase58());

  if (paymentStateAccount.signer.toBase58() !== userAccount.toBase58()) {
    console.error("Payer public key does not match payment state signer!");
    throw new Error("Payer public key mismatch");
  }

  // Create and sign the message
  const message = Buffer.concat([
    Buffer.from(account),
    amount.toArrayLike(Buffer, 'le', 8),
    frozen.toArrayLike(Buffer, 'le', 8),
    Buffer.from(sn),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);

  const signature = signMessageForEd25519(message, payerKeypair);
  try {
    const tx = await program.methods
      .deposit(account, amount, frozen, sn, expiredAt, Array.from(signature))
      .accounts({
        paymentState: paymentStatePDA,
        userTokenAccount: userAccountPDA,
        user: payerKeypair.publicKey,
        userToken: userAccount,
        programToken: programAccountPDA,
        mint: spl.NATIVE_MINT,
        record: recordPubkey,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payerKeypair])
      .rpc();

    console.log("Transaction signature:", tx);

    // Log balance after deposit
    const userBalanceAfter = await provider.connection.getBalance(
      payerKeypair.publicKey
    );
    console.log(
      "User SOL Balance after deposit:",
      userBalanceAfter / LAMPORTS_PER_SOL
    );

    const programBalanceAfter = await provider.connection.getBalance(
      programAccountPDA
    );
    console.log(
      "Program SOL Balance after deposit:",
      programBalanceAfter / LAMPORTS_PER_SOL
    );

    const userSolAccountInfo = await program.account.userTokenAccount.fetch(
      userAccountPDA
    );
    showUserTokenAccount(
      userSolAccountInfo,
      userAccountPDA,
      "User SOL Account: "
    );

    return {
      userAccountPDA,
      userSolAccountInfo,
      userBalanceAfter,
      programBalanceAfter,
    };
  } catch (error) {
    console.error("Deposits SOL Error details:", error);
    if (error instanceof anchor.AnchorError) {
      console.log("Error code:", error.error.errorCode.code);
      console.log("Error msg:", error.error.errorMessage);
    }
    throw error;
  }
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

  // Ensure user token account exists and is an associated token account
  const userTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
    provider.connection,
    payerKeypair,
    mint,
    payerKeypair.publicKey
  );
  console.log("User token account:", userTokenAccount.address.toBase58());


  const userTokenBalance = await getTokenAccountBalance(provider.connection, mint, payerKeypair.publicKey);
  console.log("User Token Balance before deposit:", userTokenBalance);


  console.log("User token account:", userTokenAccount.address.toBase58());

  const programTokenAccountBefore = await spl.getAccount(provider.connection, programTokenPDA);
  console.log("Program token account before deposit:", programTokenAccountBefore.amount);

  // Create and sign the message
  const message = Buffer.concat([
    Buffer.from(account),
    amount.toArrayLike(Buffer, 'le', 8),
    frozen.toArrayLike(Buffer, 'le', 8),
    Buffer.from(sn),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);
  // Remove the hashing step
  const signature = signMessageForEd25519(message, payerKeypair);
  try {
    const tx = await program.methods
      .deposit(account, amount, frozen, sn, expiredAt, signature)
      .accounts({
        paymentState: paymentStatePDA,
        userTokenAccount: userAccountPDA,
        user: payerKeypair.publicKey,
        userToken: userTokenAccount.address,
        programToken: programTokenPDA,
        mint: mint,
        record: recordPubkey,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([payerKeypair])
      .rpc();

    console.log("Transaction signature:", tx);
    const txResult = await provider.connection.confirmTransaction(tx, 'confirmed');
    if (txResult.value.err) {
      console.error("Transaction failed:", txResult.value.err);
      throw new Error("Transaction failed");
    }


    const programTokenAccountAfter = await spl.getAccount(provider.connection, programTokenPDA);
    console.log("Program token account after deposit:", programTokenAccountAfter.amount);

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
