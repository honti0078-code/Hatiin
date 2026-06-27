# Hatiin

*Hatiin* — Tagalog for *to split*. It's the word you say when the plates are cleared, the bill lands face-down on the table, and someone has to do the math.

**Live on Stellar testnet → [hatiin.vercel.app](https://hatiin.vercel.app)**

---

Picture the end of a long lunch. Five people, one receipt, and the familiar shuffle: somebody covers the whole thing on their card, then spends the next three days chasing everyone else for their bit. One friend forgets. One pays the wrong amount. One swears they already sent it. The person who fronted the money quietly eats the difference.

Hatiin is built to make that shuffle disappear.

One person opens a bill — a shared lunch, a group taxi, a stall-supply run — gives it a title and a total, and adds everyone by name and Stellar address. The app splits it into equal shares. From there, nobody pays *a person*. They pay *a contract*.

That's the part worth slowing down for. When the bill settles in XLM, Hatiin doesn't route money through its own backend and it doesn't ask everyone to trust the organizer to pass it along. Each person funds their share straight into a **Soroban smart contract running live on Stellar testnet** — `SplitEscrow`, deployed at [`CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT`](https://stellar.expert/explorer/testnet/contract/CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT). The escrow holds everyone's contribution. And the moment the last share lands and the pool finally equals the total, the contract pays the whole pot to the organizer **in that same transaction** — automatically, with no "claim" button for anyone to forget.

No one can release the money early. No one can divert it. And if a bill falls apart — gets cancelled, or nobody finishes funding it before the deadline — every person can pull *their own* share back out, on-chain, no questions asked. The money is never held by Hatiin, and it's never stuck.

![Hatiin landing page](../screen-shot/01-landing.jpg)

## How a bill actually moves

You sign in by proving you own your wallet, not by making a password. Hatiin uses **SEP-10**: the server hands Freighter a challenge, Freighter signs it, the server checks the signature against your Stellar public key and opens a session. That's the whole login.

![Connect with Freighter](../screen-shot/02-freighter-connect.jpg)

Opening a bill moves no money, so the organizer doesn't even need a wallet balance for it — Hatiin's deployer key signs the contract's `open_bill` server-side, and the bill is live on-chain before anyone's paid a cent.

Then each participant gets their own pay page. They tap **Pay with Freighter**; the server builds the exact `pay_share` contract call; Freighter pops up so they can read it and sign it themselves; the server submits it over **Soroban RPC**. Their XLM moves into the escrow, and a real transaction hash comes back with a link to stellar.expert. Nothing is simulated. Every share is a real testnet transaction you can go look up.

![A participant's pay screen](../screen-shot/03-pay-screen.jpg)
![Signing the pay_share invoke in Freighter](../screen-shot/04-freighter-sign.jpg)

The contribution that tips the pool over the line is the one that settles everything — `pay_share` releases the full pot to the organizer atomically, in the same call that completed the funding.

![Share funded into the escrow, settled on-chain](../screen-shot/05-pay-success.jpg)

And because nobody wants to sit on a page hitting refresh, the bill is alive. Hatiin streams payment events from Horizon and pushes them out over server-sent events, so the participant pills flip from pending to paid the instant each contribution confirms — on every open tab at once. When the final share lands and the contract settles, the whole group sees it settle together. A blockchain confirmation turns into a small shared moment instead of a private one.

## XLM by default, USDC when you want it

Hatiin settles in **native XLM** out of the box. XLM needs no trustline, so any funded wallet can pay a share immediately — there's nothing to set up and nobody gets blocked at the door.

If a group would rather settle in a stablecoin, **USDC** is one tap away. The catch with any Stellar asset that isn't XLM is the trustline — try to receive USDC without one and you hit `op_no_trust`. So Hatiin ships the fix inside the app: an **Enable USDC** button that builds a `changeTrust` operation, has you sign it in Freighter, and submits it to Horizon. One tap, and your wallet can hold USDC. (USDC bills settle as a direct classic Stellar payment rather than through the escrow contract.)

## Watching it add up

There's a public **stats** page, and it isn't decorative — it reads real usage out of the database: unique wallet users, total logins, bills created, participants added, and shares actually paid, plus a per-day login chart. It's the honest scoreboard for whether anyone's really using the thing.

![Public usage stats](../screen-shot/06-stats.jpg)

The whole app is built mobile-first, because splitting a bill happens at the table, on a phone, with the receipt still warm.

![Mobile view](../screen-shot/07-mobile.jpg)

## What's under the hood

The contract is a **Soroban / soroban-sdk 22** Rust program (`contracts/split-escrow/`), built with Rust 1.89.0 for `wasm32-unknown-unknown` and deployed with Stellar CLI v27. Its escrow token is the **native XLM Stellar Asset Contract** (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`), and its entrypoints are `open_bill`, `pay_share`, `release`, `cancel`, and `refund`, alongside `get_bill` / `total_bills` views and `pause` / `upgrade` admin hooks. The full deployment record — contract id, admin account, and the initialize transaction hash — lives in [`contracts/DEPLOYMENT.md`](contracts/DEPLOYMENT.md).

The app around it is **Next.js 16** (App Router) with **React 19** and **TypeScript**, talking to Stellar through **@stellar/stellar-sdk** and signing through the **Freighter API**. State lives in **PostgreSQL** via **Drizzle ORM** (`bills`, `participants`, `bill_payments`, `sessions`, `auth_nonces`). The UI is **Tailwind CSS v4** with **shadcn/ui**; validation is **Zod**; tests run on **Vitest** and **Playwright**. It's deployed on **Vercel**.

```
app/
  dashboard/            bill list + create form (XLM / USDC asset picker)
  bills/[id]/           bill detail — escrow badge, live participant pills
  pay/[id]/[participantId]/   per-participant pay page
  stats/                public usage metrics
  api/
    auth/               SEP-10 challenge / verify / me / logout
    bills/[id]/pay/     build + submit (contract pay_share, or classic for USDC)
    bills/[id]/stream/  Horizon-backed SSE for live updates
    stellar/trustline/  Enable-USDC changeTrust build + submit
    stats/              usage metrics
contracts/split-escrow/ the SplitEscrow Soroban contract + tests
```

## Running it yourself

```bash
pnpm install

# .env.local needs at least:
#   DRIZZLE_DATABASE_URL=postgres://...
#   SESSION_SECRET=<min 32 chars>          # openssl rand -base64 32
#   STELLAR_NETWORK=testnet
#   STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
#   SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
#   SOROBAN_SPLIT_CONTRACT_ID=CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT
#   SOROBAN_TOKEN_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
#   SOROBAN_ADMIN_SECRET=<deployer secret that signs open_bill / cancel>

pnpm run db:push     # create the schema
pnpm run dev         # http://localhost:3002
```

```bash
pnpm test            # Vitest unit + component
pnpm run test:e2e    # Playwright
```

The contract has its own toolchain. From `contracts/`:

```bash
make test            # contract unit tests
./scripts/deploy.sh  # build → optimize → deploy → initialize on testnet
```

## On going to mainnet

Everything above runs on **Stellar testnet** — that's deliberate and it's where it lives today. The path to mainnet is real but it isn't pretended-to-be-done: the app is network-aware, so pointing `STELLAR_NETWORK` (and the matching network passphrase, Horizon, and Soroban RPC endpoints) at `public` flips the SDK calls and asset issuers over, and the contract is redeployed with the exact same recipe in `contracts/DEPLOYMENT.md`, just with `--network public` and a funded mainnet source account. Same code, same contract, different network — when it's time.

---

*Built for the Stellar APAC Hackathon · Track C: Community & Social · Stellar Testnet*
