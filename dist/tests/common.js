import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, } from "@solana/web3.js";
export async function getTransactionFee(provider, txSignature) {
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
export async function showUserTokenAccount(info, userAccountPDA, mark = "") {
    const result = {
        account: userAccountPDA.toBase58(),
        available: info.available.toString(),
        frozen: info.frozen.toString(),
    };
    console.log(mark, result);
}
export async function depositSol(provider, program, payerKeypair, account, sn, amount, frozen, expiredAt) {
    // Derive the payment state account PDA
    const [paymentStatePDA] = PublicKey.findProgramAddressSync([Buffer.from("payment-state")], program.programId);
    // Derive the user token account PDA for SOL
    const [userAccountPDA] = PublicKey.findProgramAddressSync([
        Buffer.from("user-token"),
        Buffer.from(account),
        spl.NATIVE_MINT.toBuffer(),
    ], program.programId);
    // Derive the program token account PDA for SOL
    const [programAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from("program-token"), spl.NATIVE_MINT.toBuffer()], program.programId);
    // Derive the record account PDA
    const [recordPubkey] = PublicKey.findProgramAddressSync([Buffer.from("record"), Buffer.from(sn)], program.programId);
    console.log("Payment State:", paymentStatePDA.toBase58());
    console.log("User SOL Account:", userAccountPDA.toBase58());
    console.log("Program SOL Account:", programAccountPDA.toBase58());
    console.log("Record:", recordPubkey.toBase58());
    // Log balance before deposit
    const userBalance = await provider.connection.getBalance(payerKeypair.publicKey);
    console.log("User SOL Balance before deposit:", userBalance / LAMPORTS_PER_SOL);
    const userTokenAccount = payerKeypair.publicKey;
    console.log("User token account:", userTokenAccount.toBase58());
    // Create and sign the message
    const message = Buffer.concat([
        Buffer.from(account),
        amount.toArrayLike(Buffer, 'le', 8),
        frozen.toArrayLike(Buffer, 'le', 8),
        Buffer.from(sn),
        expiredAt.toArrayLike(Buffer, 'le', 8)
    ]);
    const messageHash = sha256(message);
    const signature = await ed.sign(messageHash, payerKeypair.secretKey.slice(0, 32));
    console.log("Signature:", signature);
    const fixedLengthSignature = new Uint8Array(64);
    fixedLengthSignature.set(signature);
    try {
        const tx = await program.methods
            .deposit(account, amount, frozen, sn, expiredAt, fixedLengthSignature)
            .accounts({
            paymentState: paymentStatePDA,
            userTokenAccount: userAccountPDA,
            user: payerKeypair.publicKey,
            userToken: userTokenAccount,
            programToken: programAccountPDA,
            mint: spl.NATIVE_MINT,
            record: recordPubkey,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
            ed25519Program: new PublicKey('Ed25519SigVerify111111111111111111111111111'),
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
            .signers([payerKeypair])
            .rpc();
        console.log("Transaction signature:", tx);
        // Log balance after deposit
        const userBalanceAfter = await provider.connection.getBalance(payerKeypair.publicKey);
        console.log("User SOL Balance after deposit:", userBalanceAfter / LAMPORTS_PER_SOL);
        const programBalanceAfter = await provider.connection.getBalance(programAccountPDA);
        console.log("Program SOL Balance after deposit:", programBalanceAfter / LAMPORTS_PER_SOL);
        const userSolAccountInfo = await program.account.userTokenAccount.fetch(userAccountPDA);
        showUserTokenAccount(userSolAccountInfo, userAccountPDA, "User SOL Account: ");
        return {
            userAccountPDA,
            userSolAccountInfo,
            userBalanceAfter,
            programBalanceAfter,
        };
    }
    catch (error) {
        console.error("Deposits SOL Error details:", error);
        if (error instanceof anchor.AnchorError) {
            console.log("Error code:", error.error.errorCode.code);
            console.log("Error msg:", error.error.errorMessage);
        }
        throw error;
    }
}
export async function depositTokens(provider, program, payerKeypair, mint, account, sn, amount, frozen, expiredAt) {
    // Derive the payment state account PDA
    const [paymentStatePDA] = PublicKey.findProgramAddressSync([Buffer.from("payment-state")], program.programId);
    // Derive the user token account PDA
    const [userAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from("user-token"), Buffer.from(account), mint.toBuffer()], program.programId);
    // Derive the program token account PDA
    const [programTokenPDA] = PublicKey.findProgramAddressSync([Buffer.from("program-token"), mint.toBuffer()], program.programId);
    // Derive the record account PDA
    const [recordPubkey] = PublicKey.findProgramAddressSync([Buffer.from("record"), Buffer.from(sn)], program.programId);
    // console.log("Payment State:", paymentStateKeypair.publicKey.toBase58());
    console.log("User Token Account PDA:", userAccountPDA.toBase58());
    console.log("Program Token PDA:", programTokenPDA.toBase58());
    console.log("Mint:", mint.toBase58());
    console.log("Record:", recordPubkey.toBase58());
    // Ensure user token account exists and is an associated token account
    const userTokenAccount = await spl.getOrCreateAssociatedTokenAccount(provider.connection, payerKeypair, mint, payerKeypair.publicKey);
    console.log("User token account:", userTokenAccount.address.toBase58());
    // Check if accounts exist and log their info
    const userTokenInfo = await provider.connection.getAccountInfo(userTokenAccount.address);
    console.log("User Token Account exists:", !!userTokenInfo);
    // Log balances before deposit
    if (userTokenInfo) {
        const userTokenBalance = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
        console.log("User Token Balance before deposit:", userTokenBalance.value.amount);
    }
    else {
        console.log("User Token Account does not exist");
    }
    console.log("User token account:", userTokenAccount.address.toBase58());
    const programTokenAccountBefore = await spl.getAccount(provider.connection, programTokenPDA);
    console.log("Program token account before deposit:", programTokenAccountBefore);
    // Create and sign the message
    const message = Buffer.concat([
        Buffer.from(account),
        amount.toArrayLike(Buffer, 'le', 8),
        frozen.toArrayLike(Buffer, 'le', 8),
        Buffer.from(sn),
        expiredAt.toArrayLike(Buffer, 'le', 8)
    ]);
    const signature = nacl.sign.detached(message, payerKeypair.secretKey);
    console.log("Signature:", signature);
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
        console.log("Program token account after deposit:", programTokenAccountAfter);
        // Log balances after deposit
        const userTokenBalanceAfter = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
        console.log("User Token Balance after deposit:", userTokenBalanceAfter.value.amount);
        const userTokenAccountInfo = await program.account.userTokenAccount.fetch(userAccountPDA);
        showUserTokenAccount(userTokenAccountInfo, userAccountPDA, "User Token Account: ");
        return {
            userAccountPDA,
            userTokenAccountInfo,
            userTokenBalanceAfter,
            programTokenAccountAfter,
        };
    }
    catch (error) {
        console.error("Deposits tokens Error details:", error);
        if (error instanceof anchor.AnchorError) {
            console.log("Error code:", error.error.errorCode.code);
            console.log("Error msg:", error.error.errorMessage);
        }
        throw error;
    }
}
//# sourceMappingURL=common.js.map