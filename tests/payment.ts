import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Payment } from "../target/types/payment";
import * as spl from "@solana/spl-token";
import assert from "assert";
import { Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";

describe("payment", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Payment as Program<Payment>;
  let mint: PublicKey;
  let userToken: PublicKey;
  let programToken: PublicKey;
  let userTokenAccount: PublicKey;
  let payerKeypair: Keypair;
  let paymentStateKeypair: Keypair;

  const expiredAt = new anchor.BN(new Date().getTime() / 1000 + 1000000000);

  // Define constants at the beginning of the describe block
  const PAYMENT_STATE_ACCOUNT_FILL = 1;
  const SOL_DEPOSIT_ACCOUNT_FILL = 2;
  const TOKEN_DEPOSIT_ACCOUNT_FILL = 3;

  before(async () => {
    // Define account here
    const account = Array.from(Buffer.alloc(32).fill(1));

    // Generate a new keypair for the payer
    payerKeypair = Keypair.generate();

    // Request airdrop for the payer
    const airdropSignature = await provider.connection.requestAirdrop(
      payerKeypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    paymentStateKeypair = Keypair.generate();

    // Create a new mint
    mint = await spl.createMint(
      provider.connection,
      payerKeypair,
      payerKeypair.publicKey,
      null,
      9
    );

    // Create a token account for the user
    userToken = await spl.getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerKeypair,
      mint,
      payerKeypair.publicKey
    ).then(account => account.address);

    // Mint some tokens to the user
    await spl.mintTo(
      provider.connection,
      payerKeypair,
      mint,
      userToken,
      payerKeypair.publicKey,
      1000000000 // 1000 tokens
    );

    // Derive the program token account PDA
    [programToken] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), mint.toBuffer()],
      program.programId
    );

    // Create program token account if it doesn't exist
    try {
      await spl.getOrCreateAssociatedTokenAccount(
        provider.connection,
        payerKeypair,
        mint,
        programToken,
        true // Allow owner off curve
      );
      console.log("Program token account created or already exists");
    } catch (error) {
      console.error("Error creating program token account:", error);
      throw error;
    }

    // Create SOL program account
    const [programSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), spl.NATIVE_MINT.toBuffer()],
      program.programId
    );

    // Create SOL program account
    await spl.getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerKeypair,
      spl.NATIVE_MINT,
      programSolAccount,
      true
    );

    console.log("Program token account created or initialized");
  });

  it("Initializes the payment state", async () => {
    const tx = await program.methods
      .initialize()
      .accounts({
        paymentState: paymentStateKeypair.publicKey,
        owner: payerKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payerKeypair, paymentStateKeypair])
      .rpc();

    console.log("Your transaction signature", tx);

    const paymentState = await program.account.paymentState.fetch(paymentStateKeypair.publicKey);
    console.log('paymentState:', paymentState);

    assert.strictEqual(paymentState.owner.toBase58(), payerKeypair.publicKey.toBase58(), "Owner public key doesn't match");
    assert.strictEqual(paymentState.enabled, true, "Payment state should be enabled");

    assert.deepStrictEqual(
    paymentState.feeToAccount,
    Array(32).fill(PAYMENT_STATE_ACCOUNT_FILL),
    "Fee to account doesn't match"
  );
  });

  it("Deposits SOL", async () => {
    const amount = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL
    const frozen = new anchor.BN(LAMPORTS_PER_SOL / 10); // 0.1 SOL
    const account = Array.from(Buffer.alloc(32).fill(SOL_DEPOSIT_ACCOUNT_FILL));
    const sn = Array.from(Keypair.generate().publicKey.toBuffer()); // Use a random SN for each test

    // Derive the user token account PDA for SOL
    const [userSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("user-token"), Buffer.from(account), spl.NATIVE_MINT.toBuffer()],
      program.programId
    );

    // Derive the program token account PDA for SOL
    const [programSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("program-token"), spl.NATIVE_MINT.toBuffer()],
      program.programId
    );

    // Derive the record account PDA
    const [recordPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from("record"), Buffer.from(sn)],
      program.programId
    );

    console.log("Payment State:", paymentStateKeypair.publicKey.toBase58());
    console.log("User SOL Account:", userSolAccount.toBase58());
    console.log("Program SOL Account:", programSolAccount.toBase58());
    console.log("Record:", recordPubkey.toBase58());

    // Log balance before deposit
    const userBalance = await provider.connection.getBalance(payerKeypair.publicKey);
    console.log("User SOL Balance before deposit:", userBalance / LAMPORTS_PER_SOL);

    try {
      const tx = await program.methods
        .deposit(account, amount, frozen, sn, expiredAt)
        .accounts({
          paymentState: paymentStateKeypair.publicKey,
          userTokenAccount: userSolAccount,
          user: payerKeypair.publicKey,
          userToken: payerKeypair.publicKey,
          programToken: programSolAccount,
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
      const userBalanceAfter = await provider.connection.getBalance(payerKeypair.publicKey);
      console.log("User SOL Balance after deposit:", userBalanceAfter / LAMPORTS_PER_SOL);

      const programBalanceAfter = await provider.connection.getBalance(programSolAccount);
      console.log("Program SOL Balance after deposit:", programBalanceAfter / LAMPORTS_PER_SOL);

      const userSolAccountInfo = await program.account.userTokenAccount.fetch(userSolAccount);
      console.log("User SOL Account Info:", userSolAccountInfo);

      assert.strictEqual(userSolAccountInfo.available.toString(), amount.sub(frozen).toString(), "Available balance is incorrect");
      assert.strictEqual(userSolAccountInfo.frozen.toString(), frozen.toString(), "Frozen balance is incorrect");
      assert.strictEqual(programBalanceAfter.toString(), amount.toString(), "Program SOL balance is incorrect");
    } catch (error) {
      console.error("Deposits SOL Error details:", error);
      if (error instanceof anchor.AnchorError) {
        console.log("Error code:", error.error.errorCode.code);
        console.log("Error name:", error.error.errorCode.name);
        console.log("Error msg:", error.error.errorMessage);
      }
      throw error;
    }
  });

  it("Deposits tokens", async () => {
    const amount = new anchor.BN(100000000); // 100 tokens
    const frozen = new anchor.BN(10000000); // 10 tokens
    const account = Array.from(Buffer.alloc(32).fill(TOKEN_DEPOSIT_ACCOUNT_FILL));
    const sn = Array.from(Keypair.generate().publicKey.toBuffer());

    // Derive the user token account PDA
    const [userTokenAccountPDA] = PublicKey.findProgramAddressSync(
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

    console.log("Payment State:", paymentStateKeypair.publicKey.toBase58());
    console.log("User Token Account PDA:", userTokenAccountPDA.toBase58());
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

    // Ensure program token account exists and is an associated token account
    const programTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerKeypair,
      mint,
      programTokenPDA,
      true // Allow owner off curve
    );
    console.log("Program token account:", programTokenAccount.address.toBase58());

    // Check if accounts exist and log their info
    const userTokenInfo = await provider.connection.getAccountInfo(userTokenAccount.address);
    console.log("User Token Account exists:", !!userTokenInfo);

    const programTokenInfo = await provider.connection.getAccountInfo(programTokenAccount.address);
    console.log("Program Token Account exists:", !!programTokenInfo);

    // Log balances before deposit
    if (userTokenInfo) {
      const userTokenBalance = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
      console.log("User Token Balance before deposit:", userTokenBalance.value.amount);
    } else {
      console.log("User Token Account does not exist");
    }

    if (programTokenInfo) {
      const programTokenBalance = await provider.connection.getTokenAccountBalance(programTokenAccount.address);
      console.log("Program Token Balance before deposit:", programTokenBalance.value.amount);
    } else {
      console.log("Program Token Account does not exist");
    }

    try {
      const tx = await program.methods
        .deposit(account, amount, frozen, sn, expiredAt)
        .accounts({
          paymentState: paymentStateKeypair.publicKey,
          userTokenAccount: userTokenAccountPDA,
          user: payerKeypair.publicKey,
          userToken: userTokenAccount.address,
          programToken: programTokenAccount.address,
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

      // Log balances after deposit
      const userTokenBalanceAfter = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
      console.log("User Token Balance after deposit:", userTokenBalanceAfter.value.amount);

      const programTokenBalanceAfter = await provider.connection.getTokenAccountBalance(programTokenAccount.address);
      console.log("Program Token Balance after deposit:", programTokenBalanceAfter.value.amount);

      const userTokenAccountInfo = await program.account.userTokenAccount.fetch(userTokenAccountPDA);
      console.log("User Token Account Info:", userTokenAccountInfo);

      assert.strictEqual(userTokenAccountInfo.available.toString(), "90000000", "Available balance is incorrect");
      assert.strictEqual(userTokenAccountInfo.frozen.toString(), "10000000", "Frozen balance is incorrect");
      assert.strictEqual(programTokenBalanceAfter.value.amount, "100000000", "Program token balance is incorrect");
    } catch (error) {
      console.error("Deposits tokens Error details:", error);
      if (error instanceof anchor.AnchorError) {
        console.log("Error code:", error.error.errorCode.code);
        console.log("Error name:", error.error.errorCode.name);
        console.log("Error msg:", error.error.errorMessage);
      }
      throw error;
    }
  });
});