## ✅ MAINNET (LIVE) — deployed 2026-07-12
| Field | Value |
|---|---|
| Network | **public** (Public Global Stellar Network ; September 2015) |
| Contract ID | `CCTKYTALEUAYHFKW2QOR2C6QYO2TJC6W673D455O7NSX7NG3ZRXXHN45` |
| Wasm hash | `56f4d14606620b989483735b8622171cbfe90d849706534dd67c101b852112d6` |
| Admin / deployer | `GAZBLDXXGPQUHAIICMVDTFJ2PNWG5T7ZFIMQIWFBG6BK3V3YF45OKMMV` |
| Token (XLM SAC) | `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` |
| Deploy cost | ~14.0 XLM |
| Explorer | https://stellar.expert/explorer/public/contract/CCTKYTALEUAYHFKW2QOR2C6QYO2TJC6W673D455O7NSX7NG3ZRXXHN45 |

---

# SplitEscrow — Testnet Deployment Record

Live on **Stellar Testnet** (Soroban). Verify on stellar.expert.

| Field | Value |
|---|---|
| Contract ID | `CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT` |
| Network | Test SDF Network ; September 2015 |
| Soroban RPC | https://soroban-testnet.stellar.org |
| Admin (deployer) | `GBL5RJKF4QNJ4ZPLJZ7PS7K5A4J44VEZJRV2CRTFFDRVSY2N76AIIE47` |
| Escrow token (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (native XLM SAC) |
| Initialize tx | `5b3b97e14c6c61585d763b55544530215d937c09888c86d3a515695ef0130d3b` |

- Contract: https://stellar.expert/explorer/testnet/contract/CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT
- Init tx: https://stellar.expert/explorer/testnet/tx/5b3b97e14c6c61585d763b55544530215d937c09888c86d3a515695ef0130d3b

## Entrypoints

- `initialize(admin, token)` — one-time setup.
- `open_bill(creator, total_amount, num_shares, deadline) -> u32` — admin-signed; opens a bill.
- `pay_share(bill_id, payer, amount) -> i128` — payer-signed; funds a share, auto-releases the pot to the creator on full funding.
- `release(bill_id) -> i128` — manual release safety valve.
- `cancel(bill_id)` — admin-signed; abandons a bill, opening refunds.
- `refund(bill_id, payer) -> i128` — payer-signed; reclaim a share from a cancelled/expired bill.
- views: `get_bill`, `get_contribution`, `total_bills`, `get_admin`, `get_token`, `is_paused`.
- admin: `pause`, `unpause`, `set_admin`, `upgrade`.

## Toolchain (reproducible)

```
# Rust 1.89.0 + wasm target, Stellar CLI v27
cargo +1.89.0 test                                              # 10 passed
cargo +1.89.0 build --release --target wasm32-unknown-unknown
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/split_escrow.wasm
stellar contract deploy  --wasm target/wasm32-unknown-unknown/release/split_escrow.optimized.wasm \
  --source deployer --network testnet
stellar contract invoke --id <CID> --source deployer --network testnet \
  -- initialize --admin <DEPLOYER> --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Mainnet: same recipe with `--network public` and a funded mainnet source account.
