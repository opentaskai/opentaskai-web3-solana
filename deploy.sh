#!/bin/bash
FULL_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$FULL_DIR" || exit
echo `pwd`
export SOLANA_RPC_TIMEOUT=1200
export RUST_BACKTRACE=full

action="$1"
network="$2"
program_id="$3"
buffer_id="$4"

help() {
  echo "Usage: $0 <action> <network> <program_id> <buffer_id>"
  echo "Actions:"
  echo "  write-buffer - Write the buffer to the program"
  echo "  buffer - Deploy the program with a buffer"
  echo "  standard - Deploy the program in standard mode"
  echo "Networks:"
  echo "  devnet - Solana Devnet"
  echo "  testnet - Solana Testnet"
  echo "  mainnet - Solana Mainnet"
}
write_buffer() {
  echo "Executing write-buffer deployment command:"
  echo "solana program write-buffer target/deploy/payment.so  --buffer-authority ~/.config/solana/id.json --url $1 --with-compute-unit-price 500"
  solana program write-buffer target/deploy/payment.so  --buffer-authority ~/.config/solana/id.json --url $1 --with-compute-unit-price 500
}

buffer_deployment() {
  echo "Executing buffer deployment command:"
  echo "solana program deploy --program-id $2 --buffer $3 --keypair ~/.config/solana/id.json --url $1 --with-compute-unit-price 500"
  solana program deploy --program-id $2 --buffer $3 --keypair ~/.config/solana/id.json --url $1 --with-compute-unit-price 500
}

standard_deployment() {
  echo "Executing standard deployment command:"
  echo "solana program deploy --program-id $2 target/deploy/payment.so --keypair ~/.config/solana/id.json --url $1 --with-compute-unit-price 500"
  solana program deploy --program-id $2 target/deploy/payment.so --keypair ~/.config/solana/id.json --url $1 --with-compute-unit-price 500
}

upgrade_deployment() {
  echo "Executing standard deployment command:"
  echo "solana program deploy --program-id $2 target/deploy/payment.so --upgrade-authority ~/.config/solana/id.json --url $1 --with-compute-unit-price 500 --skip-fee-check"
  solana program deploy --program-id $2 target/deploy/payment.so --upgrade-authority ~/.config/solana/id.json --url $1 --with-compute-unit-price 500 --skip-fee-check
}


case "$action" in
  "write-buffer")
    write_buffer $network
    ;;
  "buffer")
    buffer_deployment $network $program_id $buffer_id
    ;;
  "upgrade")
    upgrade_deployment $network $program_id
    ;;
  "standard")
    standard_deployment $network $program_id
    ;;
  *)
    help
    exit 1
    ;;
esac  

echo "Script finished"