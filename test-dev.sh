#!/bin/bash
export RUSTFLAGS='-C link-arg=-s'
export RUST_BACKTRACE=1

# Create a backup of the original Anchor.toml
cp Anchor.toml Anchor.toml.bak

# Determine the OS and set the sed command accordingly
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    SED_CMD='sed -i ""'
else
    # Linux
    SED_CMD='sed -i'
fi

# Modify Anchor.toml before running tests
$SED_CMD 's/cluster = "Localnet"/cluster = "devnet"/' Anchor.toml
$SED_CMD 's|# validator = { url = "https://api.devnet.solana.com" }|validator = { url = "https://api.devnet.solana.com" }|' Anchor.toml

# Run the tests
anchor test --skip-deploy

# Restore the original Anchor.toml
mv Anchor.toml.bak Anchor.toml

# Cleanup: Remove any unwanted Anchor.toml"" file if it exists
if [[ -f "Anchor.toml\"\"" ]]; then
    rm "Anchor.toml\"\""
fi