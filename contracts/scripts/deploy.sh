#!/usr/bin/env bash
#
# Build, deploy and initialize the SplitEscrow contract on Stellar Testnet.
#
# Prereqs:
#   - Rust 1.89.0 + wasm32-unknown-unknown target
#   - Stellar CLI v27 (~/.local/bin/stellar)
#   - a funded `deployer` identity (stellar keys)
#
# Usage:  ./scripts/deploy.sh
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-deployer}"
TOKEN="${TOKEN:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}" # native XLM SAC (testnet)

cd "$(dirname "$0")/.."

ADMIN_ADDR="$(stellar keys address "$IDENTITY")"
echo "▶ Network: $NETWORK   Admin: $ADMIN_ADDR"

echo "▶ Building (Rust 1.89.0)…"
( cd split-escrow && cargo +1.89.0 build --release --target wasm32-unknown-unknown )
WASM=target/wasm32-unknown-unknown/release/split_escrow.wasm
stellar contract optimize --wasm "$WASM"
OPT=target/wasm32-unknown-unknown/release/split_escrow.optimized.wasm

echo "▶ Deploying…"
CONTRACT_ID=$(stellar contract deploy --wasm "$OPT" --source "$IDENTITY" --network "$NETWORK")
echo "▶ Contract id: $CONTRACT_ID"

echo "▶ Initializing…"
stellar contract invoke --id "$CONTRACT_ID" --source "$IDENTITY" --network "$NETWORK" \
  -- initialize --admin "$ADMIN_ADDR" --token "$TOKEN"

echo ""
echo "✅ Done. Add to .env.local / Vercel:"
echo "   SOROBAN_SPLIT_CONTRACT_ID=$CONTRACT_ID"
echo "   SOROBAN_TOKEN_CONTRACT_ID=$TOKEN"
echo "   SOROBAN_ADMIN_SECRET=<secret for $ADMIN_ADDR>"
echo "   SOROBAN_RPC_URL=https://soroban-${NETWORK}.stellar.org"
