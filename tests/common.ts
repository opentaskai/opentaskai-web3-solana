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

  // Log balance before deposit
  const userBalance = await provider.connection.getBalance(
    payerKeypair.publicKey
  );
  console.log(
    "User SOL Balance before deposit:",
    userBalance / LAMPORTS_PER_SOL
  );

  try {
    const tx = await program.methods
      .deposit(account, amount, frozen, sn, expiredAt)
      .accounts({
        paymentState: paymentStatePDA,
        userTokenAccount: userAccountPDA,
        user: payerKeypair.publicKey,
        userToken: payerKeypair.publicKey,
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


  // Check if accounts exist and log their info
  const userTokenInfo = await provider.connection.getAccountInfo(
    userTokenAccount.address
  );
  console.log("User Token Account exists:", !!userTokenInfo);

  // Log balances before deposit
  if (userTokenInfo) {
    const userTokenBalance = await provider.connection.getTokenAccountBalance(
      userTokenAccount.address
    );
    console.log(
      "User Token Balance before deposit:",
      userTokenBalance.value.amount
    );
  } else {
    console.log("User Token Account does not exist");
  }


  console.log("User token account:", userTokenAccount.address.toBase58());

  const programTokenAccountBefore = await spl.getAccount(provider.connection, programTokenPDA);
  console.log("Program token account before deposit:", programTokenAccountBefore);

  try {
    const tx = await program.methods
      .deposit(account, amount, frozen, sn, expiredAt)
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
    console.log("Program token account after deposit:", programTokenAccountAfter);

    // Log balances after deposit
    const userTokenBalanceAfter =
      await provider.connection.getTokenAccountBalance(
        userTokenAccount.address
      );
    console.log(
      "User Token Balance after deposit:",
      userTokenBalanceAfter.value.amount
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
