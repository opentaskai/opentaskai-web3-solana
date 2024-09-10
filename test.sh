#!/bin/bash
export RUSTFLAGS='-C link-arg=-s'
export RUST_BACKTRACE=1
anchor test -- --features test
