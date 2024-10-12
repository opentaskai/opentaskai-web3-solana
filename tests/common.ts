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
import { getTokenAccountBalance, getPDABalance } from "../scripts/tokens";
import { parseEventFromTransaction, bytesBuffer, bytes32Buffer } from "../scripts/utils";
import assert from "assert";

export const FEE_ACCOUNT_FILL = Buffer.alloc(32).fill(1).toString('hex');
export const ZERO_ACCOUNT = new PublicKey(new Uint8Array(32).fill(0));
console.log("Zero PublicKey:", ZERO_ACCOUNT.toBase58());

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

export async function showUserTokenAccount(
  info: any,
  userAccountPDA: anchor.web3.PublicKey,
  mark: string = ""
) {
  if(!info) {
    console.log('no info');
    return;
  }
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
  sn: string,
  account: string,
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN
) {
  return deposit(provider, program, payerKeypair, payerKeypair, spl.NATIVE_MINT, sn, account, amount, frozen, expiredAt);
}

export async function depositTokens(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  mint: PublicKey,
  sn: string,
  account: string,
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN
) {
  return deposit(provider, program, payerKeypair, payerKeypair, mint, sn, account, amount, frozen, expiredAt);
}


export async function depositWithMessage(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  sn: string,
  account: string,
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

  try {
    const userTokenAccountInfo = await program.account.userTokenAccount.fetch(userAccountPDA);
    showUserTokenAccount(userTokenAccountInfo, userAccountPDA, "user Account Info token: ");
  } catch (error) {
    console.error("User Token Account Info Error details:", error);
  }
  
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
      snBuffer,
      accountBuffer,
      amount.toArrayLike(Buffer, 'le', 8),
      frozen.toArrayLike(Buffer, 'le', 8),
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
    .deposit(snBuffer, accountBuffer, amount, frozen, expiredAt, signature)
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
    
    const programTokenAccountAfter = await getPDABalance(provider.connection, mint, programTokenPDA);
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
  sn: string,
  account: string,
  amount: anchor.BN,
  frozen: anchor.BN,
  expiredAt: anchor.BN,
) {
  return depositWithMessage(provider, program, payerKeypair, signerKeypair, mint, sn, account, amount, frozen, expiredAt);
}

export async function withdraw(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  sn: string,
  account: string,
  to: PublicKey,
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
  const [recordPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), snBuffer],
    program.programId
  );

  console.log('withdraw recordPubkey:', recordPubkey);

  // Create and sign the message
  const message = Buffer.concat([
    snBuffer,
    accountBuffer,
    available.toArrayLike(Buffer, 'le', 8),
    frozen.toArrayLike(Buffer, 'le', 8),
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
      .withdraw(snBuffer, accountBuffer, available, frozen, expiredAt, signature)
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
    const eventLog = parseEventFromTransaction(txDetails, program.programId.toBase58(), 'Withdraw');
    console.log("Parsed WithdrawEvent:", eventLog);
    console.log("Parsed WithdrawEvent SN:", eventLog.sn.toString('hex')); // Log parsed SN
    
    assert.strictEqual(available.toString(), eventLog.available.toString(), "available doesn't match");
    assert.strictEqual(frozen.toString(), eventLog.frozen.toString(), "frozen doesn't match");
    assert.strictEqual(snBuffer.toString('hex'), eventLog.sn.toString('hex'), "sn doesn't match");
    assert.strictEqual(payerKeypair.publicKey.toBase58(), eventLog.user.toBase58(), "user doesn't match");

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

export async function freeze(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  sn: string,
  account: string,
  amount: anchor.BN,
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
  const [recordPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("record"), snBuffer],
    program.programId
  );


  const userTokenAccountInfoBefore = await program.account.userTokenAccount.fetch(userAccountPDA);
  showUserTokenAccount(userTokenAccountInfoBefore, userAccountPDA, "User Account Info before freeze: ");


  // Create and sign the message
  const message = Buffer.concat([
    snBuffer,
    accountBuffer,
    amount.toArrayLike(Buffer, 'le', 8),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);

  try {
    const signature = signMessageForEd25519(message, signerKeypair);
    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    });

    const tx = await program.methods
      .freeze(snBuffer, accountBuffer, amount, expiredAt, signature)
      .accounts({
        paymentState: paymentStatePDA,
        userTokenAccount: userAccountPDA,
        user: payerKeypair.publicKey,
        mint: mint,
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

    const userTokenAccountInfoAfter = await program.account.userTokenAccount.fetch(userAccountPDA);
    showUserTokenAccount(userTokenAccountInfoAfter, userAccountPDA, "User Account Info after freeze: ");
    assert.strictEqual(userTokenAccountInfoAfter.available.toString(), userTokenAccountInfoBefore.available.sub(amount).toString(), "user token account available doesn't match");
    assert.strictEqual(userTokenAccountInfoAfter.frozen.toString(), userTokenAccountInfoBefore.frozen.add(amount).toString(), "user token account froze doesn't match");


    console.log("SN bytes32:", snBuffer.toString('hex')); // Log after signing
    // Fetch the transaction details to get the events
    const txDetails = await provider.connection.getTransaction(tx, { commitment: 'confirmed' });
    // console.log("WithdrawEvent txDetails:", JSON.stringify(txDetails));
    const eventLog = parseEventFromTransaction(txDetails, program.programId.toBase58(), 'Freeze');
    console.log("Parsed FreezeEvent:", eventLog);
    console.log("Parsed FreezeEvent SN:", eventLog.sn.toString('hex')); // Log parsed SN
    
    assert.strictEqual(accountBuffer.toString(), eventLog.account.toString(), "account doesn't match");
    assert.strictEqual(amount.toString(), eventLog.amount.toString(), "amount doesn't match");
    assert.strictEqual(snBuffer.toString('hex'), eventLog.sn.toString('hex'), "sn doesn't match");
    assert.strictEqual(payerKeypair.publicKey.toBase58(), eventLog.user.toBase58(), "user doesn't match");

    return tx;
  } catch (error) {
    console.error("freeze Token Error details:", error);
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


export async function unfreezeWithAccount(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  sn: string,
  account: string,
  amount: anchor.BN,
  fee: anchor.BN,
  expiredAt: anchor.BN,
  userAccountPDA: PublicKey | undefined,
  feeAccountPDA: PublicKey | undefined,
) {
  const accountBuffer = bytes32Buffer(account);
  const snBuffer = bytes32Buffer(sn);

  // Derive the payment state account PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    program.programId
  );

  // Derive the user token account PDA
  if (!userAccountPDA) { 
    [userAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-token"), accountBuffer, mint.toBuffer()],
      program.programId
    );
  }

  // Derive the user fee account PDA
  if (!feeAccountPDA) { 
    [feeAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-token"), bytes32Buffer(FEE_ACCOUNT_FILL), mint.toBuffer()],
      program.programId
    );
  }

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

  // Create and sign the message
  const message = Buffer.concat([
    snBuffer,
    accountBuffer,
    amount.toArrayLike(Buffer, 'le', 8),
    fee.toArrayLike(Buffer, 'le', 8),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);

  try {
    const signature = signMessageForEd25519(message, signerKeypair);
    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    });

    const tx = await program.methods
      .unfreeze(snBuffer, accountBuffer, amount, fee, expiredAt, signature)
      .accounts({
        paymentState: paymentStatePDA,
        userTokenAccount: userAccountPDA,
        feeTokenAccount: feeAccountPDA,
        user: payerKeypair.publicKey,
        mint: mint,
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
    return tx;
  } catch (error) {
    console.error("freeze Token Error details:", error);
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


export async function unfreeze(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  sn: string,
  account: string,
  amount: anchor.BN,
  fee: anchor.BN,
  expiredAt: anchor.BN
) {
  const accountBuffer = bytes32Buffer(account);
  const snBuffer = bytes32Buffer(sn);

  // Derive the user token account PDA
  const [userAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), accountBuffer, mint.toBuffer()],
    program.programId
  );

  // Derive the user fee account PDA
  const [feeAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), bytes32Buffer(FEE_ACCOUNT_FILL), mint.toBuffer()],
    program.programId
  );

  // console.log('unfreeze feeAccountPDA:', feeAccountPDA);

  // const feeAccountPDAInfo = await provider.connection.getAccountInfo(feeAccountPDA);
  // console.log('feeAccountPDAInfo:', feeAccountPDAInfo);


  const userTokenAccountInfoBefore = await program.account.userTokenAccount.fetch(userAccountPDA);
  showUserTokenAccount(userTokenAccountInfoBefore, userAccountPDA, "User Account Info before freeze: ");

  const feeTokenAccountInfoBefore = await program.account.userTokenAccount.fetch(feeAccountPDA);
  showUserTokenAccount(feeTokenAccountInfoBefore, feeAccountPDA, "Fee Account Info token before: ");

  try {
    const tx = await unfreezeWithAccount(
      provider,
      program,
      payerKeypair,
      signerKeypair,
      mint,
      sn,
      account,
      amount,
      fee,
      expiredAt,
      userAccountPDA,
      feeAccountPDA,
    )

    console.log("Transaction signature:", tx);
    const txResult = await provider.connection.confirmTransaction(tx, 'confirmed');
    if (txResult.value.err) {
      console.error("Transaction failed:", txResult.value.err);
      throw new Error("Transaction failed");
    }

    const userTokenAccountInfoAfter = await program.account.userTokenAccount.fetch(userAccountPDA);
    showUserTokenAccount(userTokenAccountInfoAfter, userAccountPDA, "User Account Info after freeze: ");

    const feeTokenAccountInfoAfter = await program.account.userTokenAccount.fetch(feeAccountPDA);
    showUserTokenAccount(feeTokenAccountInfoAfter, feeAccountPDA, "Fee Account Info token after: ");

    assert.strictEqual(userTokenAccountInfoAfter.available.toString(), userTokenAccountInfoBefore.available.add(amount).sub(fee).toString(), "user token account available doesn't match");
    assert.strictEqual(userTokenAccountInfoAfter.frozen.toString(), userTokenAccountInfoBefore.frozen.sub(amount).toString(), "user token account froze doesn't match");
    assert.strictEqual(feeTokenAccountInfoAfter.available.toString(), feeTokenAccountInfoBefore.available.add(fee).toString(), "fee token account available doesn't match");

    console.log("SN bytes32:", snBuffer.toString('hex')); // Log after signing
    // Fetch the transaction details to get the events
    const txDetails = await provider.connection.getTransaction(tx, { commitment: 'confirmed' });
    // console.log("WithdrawEvent txDetails:", JSON.stringify(txDetails));
    const eventLog = parseEventFromTransaction(txDetails, program.programId.toBase58(), 'Unfreeze');
    console.log("Parsed UnFreezeEvent:", eventLog);
    console.log("Parsed UnFreezeEvent SN:", eventLog.sn.toString('hex')); // Log parsed SN
    
    assert.strictEqual(accountBuffer.toString(), eventLog.account.toString(), "account doesn't match");
    assert.strictEqual(amount.toString(), eventLog.amount.toString(), "amount doesn't match");
    assert.strictEqual(fee.toString(), eventLog.fee.toString(), "fee doesn't match");
    assert.strictEqual(snBuffer.toString('hex'), eventLog.sn.toString('hex'), "sn doesn't match");
    assert.strictEqual(payerKeypair.publicKey.toBase58(), eventLog.user.toBase58(), "user doesn't match");

    return tx;
  } catch (error) {
    console.error("freeze Token Error details:", error);
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

export async function transferWitchAccount(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  out: PublicKey,
  feeUser: PublicKey,
  sn: string,
  from: string,
  to: string,
  amount: anchor.BN,
  fee: anchor.BN,
  expiredAt: anchor.BN,
  fromTokenAccountPDA: PublicKey | undefined,
  toTokenAccountPDA: PublicKey | undefined,
  feeTokenAccountPDA: PublicKey | undefined,
) {
  const snBuffer = bytes32Buffer(sn);
  const fromBuffer = bytes32Buffer(from);
  const toBuffer = bytes32Buffer(to);

  // Derive the payment state account PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    program.programId
  );

  // Derive the from token account PDA
  if (!fromTokenAccountPDA) {
    [fromTokenAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("user-token"), fromBuffer, mint.toBuffer()],
      program.programId
    );
  }

  console.log("Derived fromTokenAccountPDA:", fromTokenAccountPDA.toBase58());

  // Derive the to token account PDA
  if (!toTokenAccountPDA) {
    [toTokenAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-token"), toBuffer, mint.toBuffer()],
      program.programId
    );
  }

  console.log("Derived toTokenAccountPDA:", toTokenAccountPDA.toBase58());

  // Derive the fee token account PDA
  if (!feeTokenAccountPDA) {      
    [feeTokenAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-token"), bytes32Buffer(FEE_ACCOUNT_FILL), mint.toBuffer()],
      program.programId
    );
  }

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


  // Create and sign the message
  const message = Buffer.concat([
    snBuffer,
    fromBuffer,
    toBuffer,
    amount.toArrayLike(Buffer, 'le', 8),
    fee.toArrayLike(Buffer, 'le', 8),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);

  try {
    const signature = signMessageForEd25519(message, signerKeypair);
    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    });

    console.log("Message:", message.toString('hex'));
    // console.log('input parameters: ',  {user: payerKeypair.publicKey.toBase58(), token: mint.toBase58(), sn: snBuffer, from:fromBuffer, to: toBuffer, amount: amount.toString(), fee: fee.toString(), expiredAt, signature});
    const tx = await program.methods
      .transfer(snBuffer, fromBuffer, toBuffer, amount, fee, expiredAt, signature)
      .accounts({
        paymentState: paymentStatePDA,
        fromTokenAccount: fromTokenAccountPDA,
        toTokenAccount: toTokenAccountPDA,
        feeTokenAccount: feeTokenAccountPDA,
        user: payerKeypair.publicKey,
        mint: mint,
        out: out,
        feeUser: feeUser,
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

    return tx;
  } catch (error) {
    console.error("Transfer Token Error details:", error);
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

export async function transfer(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  out: PublicKey,
  feeUser: PublicKey,
  sn: string,
  from: string,
  to: string,
  amount: anchor.BN,
  fee: anchor.BN,
  expiredAt: anchor.BN
) {
  const fromBuffer = bytes32Buffer(from);
  const toBuffer = bytes32Buffer(to);

  console.log("out:", out.toBase58());
  console.log("feeUser:", feeUser.toBase58()); 

  // Derive the from token account PDA
  const [fromTokenAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), fromBuffer, mint.toBuffer()],
    program.programId
  );

  // Derive the to token account PDA
  const [toTokenAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), toBuffer, mint.toBuffer()],
    program.programId
  );

  // Derive the fee token account PDA
  const [feeTokenAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), bytes32Buffer(FEE_ACCOUNT_FILL), mint.toBuffer()],
    program.programId
  );

  // Derive the program token account PDA
  const [programTokenPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-token"), mint.toBuffer()],
    program.programId
  );

  const fromTokenAccountInfoBefore = await program.account.userTokenAccount.fetch(fromTokenAccountPDA);
  showUserTokenAccount(fromTokenAccountInfoBefore, fromTokenAccountPDA, "from Account Info token before: ");

  let toTokenAccountInfoBefore: any;
  try {
    toTokenAccountInfoBefore = await program.account.userTokenAccount.fetch(toTokenAccountPDA);
    showUserTokenAccount(toTokenAccountInfoBefore, toTokenAccountPDA, "to Account Info token before: ");
  } catch (error) {
    console.error("to Token Account Info Error details:", error.message);
    toTokenAccountInfoBefore = {
      available: new anchor.BN(0),
      frozen: new anchor.BN(0),
    }
  }

  const feeTokenAccountInfoBefore = await program.account.userTokenAccount.fetch(feeTokenAccountPDA);
  showUserTokenAccount(feeTokenAccountInfoBefore, feeTokenAccountPDA, "fee Account Info token before: ");

  const programTokenBlanceBefore = await getPDABalance(provider.connection, mint, programTokenPDA);
  console.log("programTokenBlanceBefore before:", programTokenBlanceBefore);

  const fromBalanceBefore = await getTokenAccountBalance(provider.connection, mint, payerKeypair.publicKey);
  console.log("fromBalanceBefore before:", fromBalanceBefore);

  const outBalanceBefore = await getPDABalance(provider.connection, mint, out);
  console.log("outBalanceBefore before:", outBalanceBefore);

  const feeUserBalanceBefore = await getPDABalance(provider.connection, mint, feeUser);
  console.log("feeUserBalanceBefore before:", feeUserBalanceBefore);

  let balance = await provider.connection.getBalance(payerKeypair.publicKey);
  console.log("user(payer) sol Balance:", balance / LAMPORTS_PER_SOL);

  const tx = await transferWitchAccount(
    provider, 
    program, 
    payerKeypair, 
    signerKeypair, 
    mint, 
    out, 
    feeUser, 
    sn, 
    from, 
    to, 
    amount, 
    fee, 
    expiredAt, 
    fromTokenAccountPDA, toTokenAccountPDA, feeTokenAccountPDA
  ); 

  const fromTokenAccountInfoAfter = await program.account.userTokenAccount.fetch(fromTokenAccountPDA);
  showUserTokenAccount(fromTokenAccountInfoAfter, fromTokenAccountPDA, "from Account Info token after: ");

  const toTokenAccountInfoAfter = await program.account.userTokenAccount.fetch(toTokenAccountPDA);
  showUserTokenAccount(toTokenAccountInfoAfter, toTokenAccountPDA, "to Account Info token after: ");

  const feeTokenAccountInfoAfter = await program.account.userTokenAccount.fetch(feeTokenAccountPDA);
  showUserTokenAccount(feeTokenAccountInfoAfter, feeTokenAccountPDA, "fee Account Info token after: ");


  const programTokenBlanaceAfter = await getPDABalance(provider.connection, mint, programTokenPDA);
  console.log("programTokenBlanaceAfter after:", programTokenBlanaceAfter);

  const fromBalanceAfter = await getTokenAccountBalance(provider.connection, mint, payerKeypair.publicKey);
  console.log("fromBalanceAfter after:", fromBalanceAfter);

  const outBalanceAfter = await getPDABalance(provider.connection, mint, out);
  console.log("outBalanceAfter after:", outBalanceAfter);

  const feeUserBalanceAfter = await getPDABalance(provider.connection, mint, feeUser);
  console.log("feeUserBalanceAfter after:", feeUserBalanceAfter);

  assert.strictEqual(fromTokenAccountInfoAfter.frozen.toString(), fromTokenAccountInfoBefore.frozen.toString(), "from token account froze doesn't match");
  // if transfer to zero account, only inner transfer, else transfer to out account and fee account
  if(out.toBase58() === ZERO_ACCOUNT.toBase58()) {
    assert.strictEqual(fromTokenAccountInfoAfter.available.toString(), fromTokenAccountInfoBefore.available.sub(amount).toString(), "from token account available doesn't match");
    assert.strictEqual(toTokenAccountInfoAfter.available.toString(), toTokenAccountInfoBefore.available.add(amount).sub(fee).toString(), "to token account available doesn't match");
    assert.strictEqual(feeTokenAccountInfoAfter.available.toString(), feeTokenAccountInfoBefore.available.add(fee).toString(), "fee token account available doesn't match");
  } else {
    if(mint.toBase58() === spl.NATIVE_MINT.toBase58()) {
      assert.strictEqual(fromTokenAccountInfoAfter.available.lte(fromTokenAccountInfoBefore.available.sub(amount)), true, "from token account available doesn't match");
    } else {
      assert.strictEqual(fromTokenAccountInfoAfter.available.toString(), fromTokenAccountInfoBefore.available.toString(), "from token account available doesn't match");
      assert.strictEqual(fromBalanceAfter.toString(), fromBalanceBefore.toString(), "from token account balance doesn't match");
    }
    assert.strictEqual(toTokenAccountInfoAfter.available.toString(), toTokenAccountInfoBefore.available.toString(), "to token account available doesn't match");
    assert.strictEqual(feeTokenAccountInfoAfter.available.toString(), feeTokenAccountInfoBefore.available.toString(), "fee token account available doesn't match");
    
    assert.strictEqual(programTokenBlanaceAfter, BigInt(programTokenBlanceBefore) - BigInt(amount.toString()), "program token account balance doesn't match");
    assert.strictEqual(outBalanceAfter.toString(), amount.sub(fee).add(new anchor.BN(outBalanceBefore.toString())).toString(), "out token account balance doesn't match");
    assert.strictEqual(feeUserBalanceAfter.toString(), fee.add(new anchor.BN(feeUserBalanceBefore.toString())).toString(), "fee token account balance doesn't match");
  }
    
  // Fetch the transaction details to get the events
  const txDetails = await provider.connection.getTransaction(tx, { commitment: 'confirmed' });
  const eventLog = parseEventFromTransaction(txDetails, program.programId.toBase58(), 'Transfer');
  console.log("Parsed TransferEvent:", eventLog);
}

export async function settle(
  provider: anchor.AnchorProvider,
  program: Program<Payment>,
  payerKeypair: Keypair,
  signerKeypair: Keypair,
  mint: PublicKey,
  out: PublicKey,
  feeUser: PublicKey,
  sn: string,
  deal: SettlementData,
  expiredAt: anchor.BN
) {
  const snBuffer = bytes32Buffer(sn);

  // Derive the payment state account PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    program.programId
  );

  // Derive the from token account PDA
  const [fromTokenAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), deal.from, mint.toBuffer()],
    program.programId
  );

  console.log("Derived fromTokenAccountPDA:", fromTokenAccountPDA.toBase58());

  // Derive the to token account PDA
  const [toTokenAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), deal.to, mint.toBuffer()],
    program.programId
  );

  console.log("Derived toTokenAccountPDA:", toTokenAccountPDA.toBase58());

  // Derive the fee token account PDA
  const [feeTokenAccountPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("user-token"), bytes32Buffer(FEE_ACCOUNT_FILL), mint.toBuffer()],
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

  const fromTokenAccountInfo = await program.account.userTokenAccount.fetch(fromTokenAccountPDA);
  showUserTokenAccount(fromTokenAccountInfo, fromTokenAccountPDA, "from Account Info token: ");

  try {
    const toTokenAccountInfo = await program.account.userTokenAccount.fetch(toTokenAccountPDA);
    showUserTokenAccount(toTokenAccountInfo, toTokenAccountPDA, "to Account Info token: ");
  } catch (error) {
    console.error("to Token Account Info Error details:", error);
  }
  

  // Create and sign the message
  const message = Buffer.concat([
    // out.toBuffer(),
    snBuffer,
    deal.toBytes(),
    expiredAt.toArrayLike(Buffer, 'le', 8)
  ]);

  console.log("out pubkey:", out.toBase58());
  console.log("Seed 1 (user-token):", Buffer.from("user-token").toString('hex'));
  console.log("Seed 2 (from):", deal.from.toString('hex'));
  console.log("Seed 3 (mint):", mint.toBase58());

  console.log("From Token Account PDA:", fromTokenAccountPDA.toBase58());
  console.log("To Token Account PDA:", toTokenAccountPDA.toBase58());
  console.log("Out Account:", out.toBase58());
  console.log("feeUser Account:", feeUser.toBase58());
  console.log("Deal:", deal);
  console.log("Serialized Deal:", deal.toBytes().toString('hex'));

  let balance = await provider.connection.getBalance(payerKeypair.publicKey);
  console.log("user sol Balance:", balance / LAMPORTS_PER_SOL);

  try {
    const signature = signMessageForEd25519(message, signerKeypair);
    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    });

    console.log("Message:", message.toString('hex'));

    const tx = await program.methods
      .settle(snBuffer, deal, expiredAt, signature)
      .accounts({
        paymentState: paymentStatePDA,
        fromTokenAccount: fromTokenAccountPDA,
        toTokenAccount: toTokenAccountPDA,
        feeTokenAccount: feeTokenAccountPDA,
        user: payerKeypair.publicKey,
        mint: mint,
        out: out,
        feeUser: feeUser,
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

    // Fetch the transaction details to get the events
    const txDetails = await provider.connection.getTransaction(tx, { commitment: 'confirmed' });
    const eventLog = parseEventFromTransaction(txDetails, program.programId.toBase58(), 'Settlement');
    console.log("Parsed SettlementEvent:", eventLog);

    return tx;
  } catch (error) {
    console.error("Settlement Token Error details:", error);
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

export class SettlementData {
  from: Buffer;
  to: Buffer;
  available: anchor.BN;
  frozen: anchor.BN;
  amount: anchor.BN;
  fee: anchor.BN;
  paid: anchor.BN;
  excessFee: anchor.BN;

  constructor(
    from: Buffer,
    to: Buffer,
    available: anchor.BN,
    frozen: anchor.BN,
    amount: anchor.BN,
    fee: anchor.BN,
    paid: anchor.BN,
    excessFee: anchor.BN
  ) {
    this.from = from;
    this.to = to;
    this.available = available;
    this.frozen = frozen;
    this.amount = amount;
    this.fee = fee;
    this.paid = paid;
    this.excessFee = excessFee;
  }

  toBytes(): Buffer {
    return Buffer.concat([
      this.from,
      this.to,
      this.available.toArrayLike(Buffer, 'le', 8),
      this.frozen.toArrayLike(Buffer, 'le', 8),
      this.amount.toArrayLike(Buffer, 'le', 8),
      this.fee.toArrayLike(Buffer, 'le', 8),
      this.paid.toArrayLike(Buffer, 'le', 8),
      this.excessFee.toArrayLike(Buffer, 'le', 8),
    ]);
  }
}