
import { Connection, Keypair } from "@solana/web3.js";

export async function identifySolanaNetwork(connection: Connection): Promise<string> {
  try {
    const genesisHash = await connection.getGenesisHash();
    const slot = await connection.getSlot();

    switch (genesisHash) {
      case "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d":
        return "Mainnet Beta";
      case "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY":
        return "Testnet";
      case "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG":
        return "Devnet";
      default:
        // For Localnet or custom networks
        if (slot === 0) {
          return "Localnet";
        } else {
          return "Unknown Network";
        }
    }
  } catch (error) {
    console.error("Error identifying Solana network:", error);
    return "Error";
  }
}

export async function airdrop(payerKeypair: Keypair, connection: Connection, amount: number) {
  // Airdrop some SOL to the token creator if needed
  const balance = await connection.getBalance(payerKeypair.publicKey);
  console.log("Balance:", balance);
  if (balance < amount) {
    console.log("Airdropping 1 SOL...");
    const airdropSignature = await connection.requestAirdrop(
      payerKeypair.publicKey,
      amount
    );
    await connection.confirmTransaction(airdropSignature);
  }
}
