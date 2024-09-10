/// <reference types="bn.js" />
import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { Payment } from "../target/types/payment";
import { Keypair, PublicKey } from "@solana/web3.js";
export declare function getTransactionFee(provider: anchor.AnchorProvider, txSignature: string): Promise<any>;
export declare function showUserTokenAccount(info: any, userAccountPDA: anchor.web3.PublicKey, mark?: string): Promise<void>;
export declare function depositSol(provider: anchor.AnchorProvider, program: Program<Payment>, payerKeypair: Keypair, account: number[], sn: number[], amount: anchor.BN, frozen: anchor.BN, expiredAt: anchor.BN): Promise<{
    userAccountPDA: anchor.web3.PublicKey;
    userSolAccountInfo: {
        mint: anchor.web3.PublicKey;
        available: anchor.BN;
        frozen: anchor.BN;
    };
    userBalanceAfter: number;
    programBalanceAfter: number;
}>;
export declare function depositTokens(provider: anchor.AnchorProvider, program: Program<Payment>, payerKeypair: Keypair, mint: PublicKey, account: number[], sn: number[], amount: anchor.BN, frozen: anchor.BN, expiredAt: anchor.BN): Promise<{
    userAccountPDA: anchor.web3.PublicKey;
    userTokenAccountInfo: {
        mint: anchor.web3.PublicKey;
        available: anchor.BN;
        frozen: anchor.BN;
    };
    userTokenBalanceAfter: anchor.web3.RpcResponseAndContext<anchor.web3.TokenAmount>;
    programTokenAccountAfter: spl.Account;
}>;
