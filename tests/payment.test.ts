// @ts-ignore
import fs from 'fs';
import os from 'os';
import path from 'path';
import nacl from 'tweetnacl';
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Payment } from "../target/types/payment";
import * as spl from "@solana/spl-token";
import assert from "assert";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";

import { depositSol, depositTokens, showUserTokenAccount, getTransactionFee } from "./common";
import { deployToken, getTokenAccountBalance } from "../scripts/tokens";
import { airdrop } from "../scripts/utils";

describe("payment", () => {
  // Read the keypair from the JSON file
  const keypairFile = fs.readFileSync(path.join(os.homedir(), '.config', 'solana', 'id.json'), 'utf-8');
  const keypairData = JSON.parse(keypairFile);
  const payerKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  console.log("Payer keypair:", payerKeypair.publicKey.toBase58());

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Payment as Program<Payment>;

  let mint: PublicKey;
  let userTokenAccount: PublicKey;
  let programTokenPDA: PublicKey;
  let paymentStatePDA: PublicKey;
  let programSolAccount: PublicKey;

  const expiredAt = new anchor.BN(new Date().getTime() / 1000 + 1000000000);

  // Define constants at the beginning of the describe block
  const PAYMENT_STATE_ACCOUNT_FILL = 1;
  const SOL_DEPOSIT_ACCOUNT_FILL = 2;
  const TOKEN_DEPOSIT_ACCOUNT_FILL = 3;

  before(async () => {
    // Request airdrop for the payer
    await airdrop(payerKeypair, provider.connection, 3 * LAMPORTS_PER_SOL);

    // Create a new mint
    mint = await deployToken(provider.connection, payerKeypair);

    // Create a token account for the user
    userTokenAccount = await spl
      .getOrCreateAssociatedTokenAccount(
        provider.connection,
        payerKeypair,
        mint,
        payerKeypair.publicKey
      )
      .then((account) => account.address);

    const userTokenBalance = await getTokenAccountBalance(provider.connection, mint, payerKeypair.publicKey);
    console.log("User token balance:", userTokenBalance);
    if(userTokenBalance < 1000000000000) {
      // Mint some tokens to the user
      console.log("Minting tokens to user");
      await spl.mintTo(
        provider.connection,
        payerKeypair,
        mint,
        userTokenAccount,
        payerKeypair.publicKey,
        1000000000000 // 1000 tokens
      );
    }

    // Derive the payment state account PDA
    [paymentStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("payment-state")],
      program.programId
    );

    // Derive the program token account PDA
    [programTokenPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), mint.toBuffer()],
      program.programId
    );

    [programSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), spl.NATIVE_MINT.toBuffer()],
      program.programId
    );

    console.log("Program token account created or initialized");

  });

  it.skip("Initializes the payment state", async () => {
    const tx = await program.methods
      .initialize()
      .accounts({
        paymentState: paymentStatePDA,
        owner: payerKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payerKeypair])
      .rpc();

    console.log("Your transaction signature", tx);

    const paymentStateAccount = await program.account.paymentState.fetch(
      paymentStatePDA
    );
    console.log("paymentState:", paymentStateAccount);

    assert.strictEqual(
      paymentStateAccount.owner.toBase58(),
      payerKeypair.publicKey.toBase58(),
      "Owner public key doesn't match"
    );
    assert.strictEqual(
      paymentStateAccount.enabled,
      true,
      "Payment state should be enabled"
    );

    assert.deepStrictEqual(
      paymentStateAccount.feeToAccount,
      Array(32).fill(PAYMENT_STATE_ACCOUNT_FILL),
      "Fee to account doesn't match"
    );
  });
  
  it.skip("Initializes the program token", async () => {
    let accountInfo = await provider.connection.getAccountInfo(programTokenPDA);
    console.log("programTokenPDA accountInfo:", accountInfo);
    // Initialize SPL token
    try {
      const tx = await program.methods
        .initializeProgramToken()
        .accounts({
          paymentState: paymentStatePDA,
          owner: payerKeypair.publicKey,
          mint: mint,
          programToken: programTokenPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([payerKeypair])
        .rpc();

      console.log("SPL Program token initialized. Transaction signature:", tx);

      // Verify the initialization
      const programTokenAccount = await spl.getAccount(provider.connection, programTokenPDA);
      assert(programTokenAccount !== null, "Program token account should exist");
      assert.strictEqual(programTokenAccount.mint.toBase58(), mint.toBase58(), "Program token account mint doesn't match");
      assert.strictEqual(programTokenAccount.owner.toBase58(), paymentStatePDA.toBase58(), "Program token account owner doesn't match");
      assert.strictEqual(programTokenAccount.amount.toString(), "0", "Program token account should have 0 balance initially");

    } catch (error) {
      console.error("Error initializing SPL program token:", error);
      throw error;
    }

    accountInfo = await provider.connection.getAccountInfo(programSolAccount);
    console.log("programSolAccount accountInfo:", accountInfo);
    // Initialize SOL token
    try {
      const tx = await program.methods
        .initializeProgramToken()
        .accounts({
          paymentState: paymentStatePDA,
          owner: payerKeypair.publicKey,
          mint: spl.NATIVE_MINT,
          programToken: programSolAccount,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([payerKeypair])
        .rpc();

      console.log("SOL Program token initialized. Transaction signature:", tx);

      // Verify the initialization
      const programSolAccountInfo = await provider.connection.getAccountInfo(programSolAccount);
      assert(programSolAccountInfo !== null, "Program SOL account should exist");
      assert(programSolAccountInfo.owner.equals(SystemProgram.programId), "Program SOL account should be owned by the System Program");
      assert(programSolAccountInfo.lamports > 0, "Program SOL account should have some balance");

    } catch (error) {
      console.error("Error initializing SOL program token:", error);
      throw error;
    }

    // Verify correct derivation of account addresses
    const [expectedProgramToken] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), mint.toBuffer()],
      program.programId
    );
    assert(programTokenPDA.equals(expectedProgramToken), "SPL Program token address is not correctly derived");

    const [expectedProgramSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), spl.NATIVE_MINT.toBuffer()],
      program.programId
    );
    assert(programSolAccount.equals(expectedProgramSolAccount), "SOL Program token address is not correctly derived");
  });

  it("Deposits SOL", async () => {
    const amount = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL
    const frozen = new anchor.BN(LAMPORTS_PER_SOL / 10); // 0.1 SOL
    const account = Array.from(Buffer.alloc(32).fill(SOL_DEPOSIT_ACCOUNT_FILL));
    const sn = Array.from(Keypair.generate().publicKey.toBuffer()); // Use a random SN for each test

    // Get the initial balance of the program SOL account
    const programBalanceBefore = await provider.connection.getBalance(programSolAccount);
    console.log("Program SOL balance before deposit:", programBalanceBefore / LAMPORTS_PER_SOL);

    const {
      userAccountPDA,
      userSolAccountInfo,
      userBalanceAfter,
      programBalanceAfter,
    } = await depositSol(
      provider,
      program,
      payerKeypair,
      account,
      sn,
      amount,
      frozen,
      expiredAt
    );

    assert.strictEqual(
      userSolAccountInfo.available.toString(),
      amount.sub(frozen).toString(),
      "Available balance is incorrect"
    );
    assert.strictEqual(
      userSolAccountInfo.frozen.toString(),
      frozen.toString(),
      "Frozen balance is incorrect"
    );
    
    const expectedBalance = new anchor.BN(programBalanceBefore).add(amount);
    console.log("Expected balance after deposit:", expectedBalance.toString());
    assert.strictEqual(
      programBalanceAfter.toString(),
      expectedBalance.toString(),
      `Program SOL balance is incorrect. Expected ${expectedBalance}, got ${programBalanceAfter}`
    );
  });
/*
  it("Deposits tokens", async () => {
    const amount = new anchor.BN(1000000000); // 1 tokens
    const frozen = new anchor.BN(100000000); // 0.1 tokens
    const account = Array.from(
      Buffer.alloc(32).fill(TOKEN_DEPOSIT_ACCOUNT_FILL)
    );
    const sn = Array.from(Keypair.generate().publicKey.toBuffer());

    const {
      userAccountPDA,
      userTokenAccountInfo,
      userTokenBalanceAfter,
      programTokenAccountAfter,
    } = await depositTokens(
      provider,
      program,
      payerKeypair,
      mint,
      account,
      sn,
      amount,
      frozen,
      expiredAt
    );

    assert.strictEqual(
      userTokenAccountInfo.available.toString(),
      "900000000",
      "Available balance is incorrect"
    );
    assert.strictEqual(
      userTokenAccountInfo.frozen.toString(),
      "100000000",
      "Frozen balance is incorrect"
    );
    assert.strictEqual(
      programTokenAccountAfter.amount.toString(),
      "1000000000",
      "Program token balance is incorrect"
    );
  });

  it("Deposits and then withdraws SOL", async () => {
    // Deposit SOL first
    const depositAmount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 2 SOL
    const depositFrozen = new anchor.BN(LAMPORTS_PER_SOL / 10); // 0.1 SOL
    const account = Array.from(Buffer.alloc(32).fill(SOL_DEPOSIT_ACCOUNT_FILL));
    const depositSN = Array.from(Keypair.generate().publicKey.toBuffer());

    const {
      userAccountPDA,
      userSolAccountInfo,
      userBalanceAfter: userBalanceAfterDeposit,
      programBalanceAfter: programBalanceAfterDeposit,
    } = await depositSol(
      provider,
      program,
      payerKeypair,
      account,
      depositSN,
      depositAmount,
      depositFrozen,
      expiredAt
    );

    // Now perform withdraw
    const withdrawAvailable = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL
    const withdrawFrozen = new anchor.BN(LAMPORTS_PER_SOL / 20); // 0.05 SOL
    const withdrawSN = Array.from(Keypair.generate().publicKey.toBuffer());

    console.log("Withdraw SOL - Program Token PDA:", programSolAccount.toBase58());

    // Derive the record account PDA for withdraw
    const [withdrawRecordPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from("record"), Buffer.from(withdrawSN)],
      program.programId
    );

    // Record balances before withdrawal
    const userBalanceBefore = await provider.connection.getBalance(payerKeypair.publicKey);
    const programBalanceBefore = await provider.connection.getBalance(programSolAccount);
    console.log("User SOL Balance before withdraw:", userBalanceBefore / LAMPORTS_PER_SOL);
    console.log("Program SOL Balance before withdraw:", programBalanceBefore / LAMPORTS_PER_SOL);

    const userSolAccountInfoBefore = await program.account.userTokenAccount.fetch(userAccountPDA);
    showUserTokenAccount(userSolAccountInfoBefore, userAccountPDA, "User SOL Account Info before withdraw: ");

    // Create and sign the message
    const message = Buffer.concat([
      Buffer.from(account),
      withdrawAvailable.toArrayLike(Buffer, 'le', 8),
      withdrawFrozen.toArrayLike(Buffer, 'le', 8),
      Buffer.from(withdrawSN),
      expiredAt.toArrayLike(Buffer, 'le', 8)
    ]);
    // Remove the hashing step
    const signature = nacl.sign.detached(message, payerKeypair.secretKey);
    console.log("Signature:", Buffer.from(signature).toString('hex'));

    let txSignature;
    try {
      txSignature = await program.methods
        .withdraw(
          account,
          withdrawAvailable,
          withdrawFrozen,
          withdrawSN,
          expiredAt,
          signature,
        )
        .accounts({
          paymentState: paymentStatePDA,
          userTokenAccount: userAccountPDA,
          user: payerKeypair.publicKey,
          mint: spl.NATIVE_MINT,
          to: payerKeypair.publicKey,
          userToken: payerKeypair.publicKey,
          programToken: programSolAccount,
          record: withdrawRecordPubkey,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          ed25519Program: new PublicKey('Ed25519SigVerify111111111111111111111111111'),
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([payerKeypair])
        .rpc();

      console.log("Withdraw Transaction signature:", txSignature);

      // Wait for transaction confirmation
      await provider.connection.confirmTransaction(txSignature);

      // Record balances after withdrawal
      const userBalanceAfter = await provider.connection.getBalance(payerKeypair.publicKey);
      const programBalanceAfter = await provider.connection.getBalance(programSolAccount);
      console.log("User SOL Balance after withdraw:", userBalanceAfter / LAMPORTS_PER_SOL);
      console.log("Program SOL Balance after withdraw:", programBalanceAfter / LAMPORTS_PER_SOL);

      const userSolAccountInfoAfter = await program.account.userTokenAccount.fetch(userAccountPDA);
      showUserTokenAccount(userSolAccountInfoAfter, userAccountPDA, "User SOL Account Info after withdraw: ");

      // Calculate the actual balance changes
      let userBalanceChange: anchor.BN;
      try {
        console.log("User balance after:", userBalanceAfter);
        console.log("User balance before:", userBalanceBefore);
        userBalanceChange = new anchor.BN(userBalanceAfter.toString()).sub(new anchor.BN(userBalanceBefore.toString()));
        console.log("User balance change:", userBalanceChange.toString());
      } catch (error) {
        console.error("Error calculating user balance change:", error);
        console.error("User balance after:", userBalanceAfter);
        console.error("User balance before:", userBalanceBefore);
        throw error;
      }
      const programBalanceChange = new anchor.BN(programBalanceAfter).sub(new anchor.BN(programBalanceBefore));
      const totalWithdrawn = withdrawAvailable.add(withdrawFrozen);
      console.log("User balance change:", userBalanceChange.toString());
      console.log("Program balance change:", programBalanceChange.toString());
      console.log("Total withdrawn:", totalWithdrawn.toString());

      const txFee = await getTransactionFee(provider, txSignature);
      console.log("Transaction fee:", txFee);
      // Check balance changes with fee consideration
      const expectedUserBalanceChange = totalWithdrawn.sub(new anchor.BN(txFee));
      const balanceDifference = userBalanceChange.sub(expectedUserBalanceChange).abs();
      console.log("Expected user balance change:", expectedUserBalanceChange.toString());
      console.log("Actual user balance change:", userBalanceChange.toString());
      console.log("Balance difference:", balanceDifference.toString());

      const allowedError = new anchor.BN(1000000); // Allow for a small error (0.001 SOL)

      assert.ok(
        balanceDifference.lte(allowedError),
        `User balance change (${userBalanceChange.toString()}) should be close to expected change (${expectedUserBalanceChange.toString()}), difference: ${balanceDifference.toString()}`
      );

      // Check program balance change
      assert.ok(
        programBalanceChange.eq(totalWithdrawn.neg()),
        `Program balance change (${programBalanceChange.toString()}) should equal negative of total withdrawn (${totalWithdrawn.neg().toString()})`
      );

      // Check user token account balance changes
      assert.strictEqual(
        userSolAccountInfoAfter.available.toString(),
        new anchor.BN(userSolAccountInfoBefore.available).sub(withdrawAvailable).toString(),
        "Available balance is incorrect after withdraw"
      );
      assert.strictEqual(
        userSolAccountInfoAfter.frozen.toString(),
        new anchor.BN(userSolAccountInfoBefore.frozen).sub(withdrawFrozen).toString(),
        "Frozen balance is incorrect after withdraw"
      );

    } catch (error) {
      console.error("Withdraw SOL Error details:", error);
      if (error instanceof anchor.AnchorError) {
        console.log("Error code:", error.error.errorCode.code);
        console.log("Error msg:", error.error.errorMessage);
      } else if (error instanceof anchor.web3.SendTransactionError) {
        console.log("Transaction Error:", error.message);
        console.log("Error Logs:", error.logs);
      }
      throw error;
    }
  });

  it("Deposits and then withdraws Tokens", async () => {
    const account = Array.from(Buffer.alloc(32).fill(TOKEN_DEPOSIT_ACCOUNT_FILL));
    const depositAmount = new anchor.BN(2000000000);
    const depositFrozen = new anchor.BN(100000000);

    // Perform deposit
    const {
      userAccountPDA,
      userTokenAccountInfo,
      userTokenBalanceAfter,
      programTokenAccountAfter 
    } = await depositTokens(
      provider,
      program,
      payerKeypair,
      mint,
      account,
      Array.from(Keypair.generate().publicKey.toBuffer()),
      depositAmount,
      depositFrozen,
      expiredAt
    );


    // Get the user's associated token account
    const userATA = await spl.getAssociatedTokenAddress(mint, payerKeypair.publicKey);
    const userTokenBalanceBefore = await spl.getAccount(provider.connection, userATA);
    console.log("User Token Balance before withdraw:", userTokenBalanceBefore.amount);
    showUserTokenAccount(userTokenAccountInfo, userATA, "User Token Account Info before withdraw: ");

    const withdrawAvailable = new anchor.BN(1000000000);
    const withdrawFrozen = new anchor.BN(50000000);
    const withdrawSN = Array.from(Keypair.generate().publicKey.toBuffer());

    // Derive the program token account PDA
    const [programTokenPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), mint.toBuffer()],
      program.programId
    );

    // Derive the withdraw record PDA
    const [withdrawRecordPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from("record"), Buffer.from(withdrawSN)],
      program.programId
    );

    // Create and sign the message
    const message = Buffer.concat([
      Buffer.from(account),
      withdrawAvailable.toArrayLike(Buffer, 'le', 8),
      withdrawFrozen.toArrayLike(Buffer, 'le', 8),
      Buffer.from(withdrawSN),
      expiredAt.toArrayLike(Buffer, 'le', 8)
    ]);
    // Remove the hashing step
    const signature = nacl.sign.detached(message, payerKeypair.secretKey);
    console.log("Signature:", Buffer.from(signature).toString('hex'));

    try {
      const tx = await program.methods
        .withdraw(account, withdrawAvailable, withdrawFrozen, withdrawSN, expiredAt, signature)
        .accounts({
          paymentState: paymentStatePDA,
          userTokenAccount: userAccountPDA,
          user: payerKeypair.publicKey,
          mint: mint,
          to: userTokenAccount,
          userToken: userTokenAccount,
          programToken: programTokenPDA,
          record: withdrawRecordPubkey,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          ed25519Program: new PublicKey('Ed25519SigVerify111111111111111111111111111'),
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([payerKeypair])
        .rpc();

      console.log("Withdraw Transaction signature:", tx);

      // Record balance after withdrawal
      const userTokenBalanceAfter = await spl.getAccount(provider.connection, userATA);
      console.log("User Token Balance after withdraw:", userTokenBalanceAfter.amount.toString());

      const userTokenAccountInfoAfter = await program.account.userTokenAccount.fetch(userAccountPDA);
      showUserTokenAccount(userTokenAccountInfoAfter, userAccountPDA, "User Token Account Info after withdraw: ");

      // Log all relevant values for debugging
      console.log(
        "Initial available:",
        userTokenAccountInfo.available.toString()
      );
      console.log(
        "Initial frozen:",
        userTokenAccountInfo.frozen.toString()
      );
      console.log("Withdraw amount:", withdrawAvailable.toString());
      console.log("Withdraw frozen:", withdrawFrozen.toString());

      // Calculate expected available and frozen balances
      const expectedAvailable = new anchor.BN(
        userTokenAccountInfo.available
      )
        .sub(withdrawAvailable)
      const expectedFrozen = new anchor.BN(
        userTokenAccountInfo.frozen
      ).sub(withdrawFrozen);

      console.log("Expected available:", expectedAvailable.toString());
      console.log("Expected frozen:", expectedFrozen.toString());
      console.log(
        "Actual available:",
        userTokenAccountInfoAfter.available.toString()
      );
      console.log(
        "Actual frozen:",
        userTokenAccountInfoAfter.frozen.toString()
      );

      // Strictly check balances
      assert.strictEqual(
        userTokenAccountInfoAfter.available.toString(),
        expectedAvailable.toString(),
        "Available balance is incorrect after withdraw"
      );

      assert.strictEqual(
        userTokenAccountInfoAfter.frozen.toString(),
        expectedFrozen.toString(),
        "Frozen balance is incorrect after withdraw"
      );

      // Check total balance change
      const totalBalanceBefore = new anchor.BN(
        userTokenAccountInfo.available
      ).add(new anchor.BN(userTokenAccountInfo.frozen));
      const totalBalanceAfter = new anchor.BN(
        userTokenAccountInfoAfter.available
      ).add(new anchor.BN(userTokenAccountInfoAfter.frozen));
      const expectedTotalBalanceChange = withdrawAvailable
        .add(withdrawFrozen)
        .neg();

      assert.strictEqual(
        totalBalanceAfter.sub(totalBalanceBefore).toString(),
        expectedTotalBalanceChange.toString(),
        "Total balance change is incorrect after withdraw"
      );
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
  });
  */
});
