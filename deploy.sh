#!/bin/bash
FULL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$FULL_DIR" || exit
echo `pwd`

if [ "$1" = "buffer" ] && [ -n "$2" ]; then
  echo "Executing buffer deployment command:"
  echo "solana program deploy --program-id ./target/deploy/payment-keypair.json --buffer $2 --upgrade-authority ~/.config/solana/id.json --url devnet"
  solana program deploy --program-id ./target/deploy/payment-keypair.json --buffer $2 --upgrade-authority ~/.config/solana/id.json --url devnet
else
  anchor build
  echo "Executing standard deployment command:"
  echo "solana program deploy --program-id ./target/deploy/payment-keypair.json ./target/deploy/payment.so --upgrade-authority ~/.config/solana/id.json --url devnet --with-compute-unit-price 1000"
  solana program deploy --program-id ./target/deploy/payment-keypair.json ./target/deploy/payment.so --upgrade-authority ~/.config/solana/id.json --url devnet --with-compute-unit-price 1000
fi

echo "Script finished"