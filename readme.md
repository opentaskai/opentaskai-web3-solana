# lib.rs
When modifying the #[instruction(...)] attribute, ensure that the order and presence of parameters match what the client sends. You can remove unused parameters from the end, but be cautious about removing or reordering parameters in the middle. This will help avoid errors related to parameter mismatches.

Multiple init_if_needed Accounts might be problematic.
If multiple accounts are derived using the same seed prefix, it can lead to conflicts in PDA derivation. Each account must have a unique PDA derived from its seeds. If two accounts are initialized with the same seed prefix, it can cause unexpected behavior.

# Use custom programId

```
generate keypair:
$ solana-keygen new --outfile target/deploy/payment-keypair.json

get public key:
$ pnpm cli scripts/accounts.ts target/deploy/payment-keypair.json

replace payment public key:
/Anchor.toml
[programs.localnet]
payment = "7mEtBse9oundTRfuYNTmPBaYr1gGNM5sewKDo23meJXe"

promgrams/src/lib.rs
declare_id!("7mEtBse9oundTRfuYNTmPBaYr1gGNM5sewKDo23meJXe");
```