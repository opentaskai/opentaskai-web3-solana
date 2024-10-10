# lib.rs
When modifying the #[instruction(...)] attribute, ensure that the order and presence of parameters match what the client sends. You can remove unused parameters from the end, but be cautious about removing or reordering parameters in the middle. This will help avoid errors related to parameter mismatches.

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