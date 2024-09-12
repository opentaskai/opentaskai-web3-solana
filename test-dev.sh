#!/bin/bash
export RUSTFLAGS='-C link-arg=-s'
export RUST_BACKTRACE=1
anchor test --skip-deploy
