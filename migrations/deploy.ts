// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

const anchor = require("@coral-xyz/anchor");
const { Program } = require("@coral-xyz/anchor");
const { PublicKey } = require("@solana/web3.js");

module.exports = async function (provider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  // Get the program ID from the workspace
  const program = anchor.workspace.Payment;
  const programId = program.programId;

  console.log("Payment Program ID:", programId.toString());

  // Derive the payment state PDA
  const [paymentStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment-state")],
    programId
  );

  try {
    // Initialize the payment state
    const tx = await program.methods
      .initialize()
      .accounts({
        paymentState: paymentStatePDA,
        owner: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Initialization transaction signature:", tx);

    // Fetch the payment state account to verify initialization
    const paymentStateAccount = await program.account.paymentState.fetch(paymentStatePDA);
    console.log("Payment state initialized:", paymentStateAccount.enabled);

    const res = {
      programId: programId.toString(),
      transactionSignature: tx,
      paymentStatePDA: paymentStatePDA.toString(),
    };
    console.log("Deployment result:", res);
    return res;
  } catch (error) {
    console.error("Error during deployment:", error);
    throw error;
  }
};
