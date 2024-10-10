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
import { parseEventFromTransaction, bytesBuffer, bytes32Buffer } from "../scripts/utils";
import assert from "assert";

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
  // console.log("Signature:", signature);
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
  account: string,
  sn: string,
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN
) {
  return deposit(provider, program, payerKeypair, payerKeypair, spl.NATIVE_MINT, account, sn, amount, frozen, expiredAt);
}

export async function depositTokens(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  mint: PublicKey,
  account: string,
  sn: string,
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN
) {
  return deposit(provider, program, payerKeypair, payerKeypair, mint, account, sn, amount, frozen, expiredAt);
}


export async function depositWithMessage(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  account: string,
  sn: string,
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN,
  message: Buffer = null
) {
  const accountBuffer = bytes32Buffer(account);
  const snBuffer = bytes32Buffer(sn);
  // Derive the payment state account PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    program.programId
  );

  // Derive the user token account PDA
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), accountBuffer, mint.toBuffer()],
    program.programId
  );

  // Derive the program token account PDA
  const [programTokenPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-token"), mint.toBuffer()],
    program.programId
  );

  // Derive the record account PDA
  const [recordPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), snBuffer],
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

  if (message == null) {
    // Create and sign the message
    message = Buffer.concat([
      accountBuffer,
      amount.toArrayLike(Buffer, 'le', 8),
      frozen.toArrayLike(Buffer, 'le', 8),
      snBuffer,
      expiredAt.toArrayLike(Buffer, 'le', 8)
    ]);
  }
  console.log("SN before signing:", snBuffer.toString('hex')); // Log before signing
  const signature = signMessageForEd25519(message, signerKeypair);
  console.log("Message for signing:", message.toString('hex'));

  try {
    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    });
    
    // console.log('input parameters: ',  {user: payerKeypair.publicKey.toBase58(), token: mint, account:accountBuffer, amount: amount.toString(), frozen: frozen.toString(), sn: snBuffer, expiredAt, signature});
    const tx = await program.methods
    .deposit(accountBuffer, amount, frozen, snBuffer, expiredAt, signature)
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
    console.log("SN bytes32:", snBuffer.toString('hex')); // Log after signing
    // Fetch the transaction details to get the events
    const txDetails = await provider.connection.getTransaction(tx, { commitment: 'confirmed' });
    // console.log("DepositEvent txDetails:", JSON.stringify(txDetails));
    const depositEvent = parseEventFromTransaction(txDetails, program.programId.toBase58(), 'Deposit');
    console.log("Parsed DepositEvent:", depositEvent);
    console.log("Parsed DepositEvent SN:", depositEvent.sn.toString('hex')); // Log parsed SN
    console.log("Parsed DepositEvent user:", depositEvent.user.toBase58()); // Log parsed user
    
    assert.strictEqual(amount.toString(), depositEvent.amount.toString(), "amount doesn't match");
    assert.strictEqual(frozen.toString(), depositEvent.frozen.toString(), "frozen doesn't match");
    assert.strictEqual(snBuffer.toString('hex'), depositEvent.sn.toString('hex'), "sn doesn't match");
    assert.strictEqual(payerKeypair.publicKey.toBase58(), depositEvent.user.toBase58(), "user doesn't match");
    
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


export async function deposit(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  account: string,
  sn: string,
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN,
) {
  return depositWithMessage(provider, program, payerKeypair, signerKeypair, mint, account, sn, amount, frozen, expiredAt);
}

export async function withdraw(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  account: string,
  to: PublicKey,
  sn: string,
  available: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN
) {
  const accountBuffer = bytes32Buffer(account);
  const snBuffer = bytes32Buffer(sn);

  // Derive the payment state account PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    program.programId
  );

  // Derive the user token account PDA
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), accountBuffer, mint.toBuffer()],
    program.programId
  );

  // Derive the program token account PDA
  const [programTokenPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-token"), mint.toBuffer()],
    program.programId
  );

  // Derive the record account PDA
  // todo [Buffer.from("record"), Buffer.from(withdrawSN.slice(0, 26))], // Adjusted to fit within 32 bytes
  const [recordPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), snBuffer],
    program.programId
  );

  console.log('withdraw recordPubkey:', recordPubkey);

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

  // Create and sign the message
  const message = Buffer.concat([
    accountBuffer,
    available.toArrayLike(Buffer, 'le', 8),
    frozen.toArrayLike(Buffer, 'le', 8),
    snBuffer,
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);

  try {
    const signature = signMessageForEd25519(message, signerKeypair);
    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    });

    // console.log('input parameters: ',  {user: payerKeypair.publicKey.toBase58(), token: mint, account:accountBuffer, available: available.toString(), frozen: frozen.toString(), sn: snBuffer, expiredAt, signature});
    const tx = await program.methods
      .withdraw(accountBuffer, available, frozen, snBuffer, expiredAt, signature)
      .accounts({
        paymentState: paymentStatePDA,
        userTokenAccount: userAccountPDA,
        user: payerKeypair.publicKey,
        mint: mint,
        to,
        programToken: programTokenPDA,
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
    console.log("SN bytes32:", snBuffer.toString('hex')); // Log after signing
    // Fetch the transaction details to get the events
    const txDetails = await provider.connection.getTransaction(tx, { commitment: 'confirmed' });
    // console.log("WithdrawEvent txDetails:", JSON.stringify(txDetails));
    const withdrawEvent = parseEventFromTransaction(txDetails, program.programId.toBase58(), 'Withdraw');
    console.log("Parsed WithdrawEvent:", withdrawEvent);
    console.log("Parsed WithdrawEvent SN:", withdrawEvent.sn.toString('hex')); // Log parsed SN
    
    assert.strictEqual(available.toString(), withdrawEvent.available.toString(), "available doesn't match");
    assert.strictEqual(frozen.toString(), withdrawEvent.frozen.toString(), "frozen doesn't match");
    assert.strictEqual(snBuffer.toString('hex'), withdrawEvent.sn.toString('hex'), "sn doesn't match");
    assert.strictEqual(payerKeypair.publicKey.toBase58(), withdrawEvent.user.toBase58(), "user doesn't match");

    return tx;
  } catch (error) {
    console.error("Withdraw Token Error details:", error);
    if (error instanceof anchor.AnchorError) {
      console.log("Error code:", error.error.errorCode.code);
      console.log("Error msg:", error.error.errorMessage);
    } else if (error instanceof anchor.web3.SendTransactionError) {
      console.log("Transaction Error:", error.message);
      console.log("Error Logs:", error.logs);
    }
    throw error;
  }
}

export async function checkTransactionExecuted(provider: anchor.AnchorProvider, program: Program<Payment>, sn: string) {
  // Derive the PDA for the TransactionRecord
  const [transactionRecordPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), bytes32Buffer(sn)],
    program.programId
  );

  // Fetch the TransactionRecord account
  try {
    const transactionRecord = await program.account.transactionRecord.fetch(transactionRecordPDA);
    console.log('transactionRecord:', transactionRecord);
    // Check if the transaction has been executed
    return transactionRecord.executed;
  } catch(e: any) {
    console.log('transactionRecord except:', e.message);
    if (e.message.indexOf('Account does not exist or has no data') != -1) return false;
    throw e;
  } 
}