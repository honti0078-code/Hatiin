ARCHITECTURE

Hatiin — group bill splitting on Stellar where every participant pays a Soroban smart contract (SplitEscrow) instead of paying another person, and the pot is released to the organizer automatically in the same transaction that completes funding.

The product is the Stellar APAC Hackathon Track C Community and Social entry. Tagalog hatiin means to split — the word you say when the plates are cleared and the math starts. Hatiin is the app that does the math, takes the money on-chain, and never holds it server-side.

The system is one Next.js 16 App Router process plus one PostgreSQL database plus one deployed Soroban contract plus one Freighter wallet extension per user. There is no separate backend service. The Next.js process serves the React UI, owns the route handlers that sign into Stellar (SEP-10), drives Soroban RPC for the escrow, and proxies Horizon for classic USDC payments. The Soroban contract is the source of truth for the pot; the database is the index of users, bills, participants, payments, sessions, and auth nonces.


STACK

1. FRONTEND
   1.1. Next.js 16.2.7 (App Router) + React 19.2.4 + TypeScript 5
   1.2. Tailwind CSS v4 + shadcn/ui (Radix primitives) + sonner toasts
   1.3. react-hook-form 7 + zod 4 for client-side validation
   1.4. framer-motion 12 for subtle pill flips on participant status
   1.5. qrcode for share-link and pay-link deep QR generation
   1.6. Mobile-first responsive layout — bills are split at the table on a phone

2. BACKEND
   2.1. Next.js Route Handlers under app/api (App Router)
   2.2. Composition of typed middlewares (compose / withError / withAuth / withOptionalAuth / withRateLimit / withRateLimitSse / withDemoMode)
   2.3. Controllers (src/server/controller/) call services (src/server/service/) for business logic
   2.4. Zod-validated request bodies; all responses wrapped in { ok, data, error } envelope
   2.5. AppError class with code + status; http.ts helpers ok(), created(), badRequest(), etc.
   2.6. Server-Sent Events under app/api/bills/[id]/stream for live participant pill updates

3. DATABASE
   3.1. PostgreSQL via Drizzle ORM 0.45 + drizzle-kit 0.31
   3.2. Schema in src/server/db/schema/ (one file per table) and a barrel index
   3.3. Driver: pg 8.21; Drizzle client in src/server/db/client.ts
   3.4. Local dev uses docker postgres; production runs on Supabase Postgres
   3.5. db:push applies the schema directly (no migration files committed)

4. BLOCKCHAIN
   4.1. Stellar Testnet (Test SDF Network ; September 2015 passphrase)
   4.2. Soroban RPC at https://soroban-testnet.stellar.org
   4.3. Horizon at https://horizon-testnet.stellar.org
   4.4. Soroban contract SplitEscrow at CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT
   4.5. Escrow token is the native XLM Stellar Asset Contract (SAC) at CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
   4.6. USDC on testnet uses issuer GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 and settles via classic payment
   4.7. @stellar/stellar-sdk 15.1 for Keypair, TransactionBuilder, Contract, SAC client, Asset

5. WALLET
   5.1. @stellar/freighter-api 6.0.1 wrapper
   5.2. src/ui/hooks/useFreighter.ts exposes requestAccess, getPublicKey, signTransaction
   5.3. SEP-10 authentication — server sends a challenge transaction with ManageData; Freighter signs it; server verifies the ed25519 signature against sha256(network_id + tx_envelope_xdr)
   5.4. Per-participant pay page triggers Freighter for the contract invoke (XLM) or classic payment (USDC)


DIRECTORY LAYOUT

1. app/ — Next.js App Router pages (NOT under src/app/)
   1.1. app/page.tsx — landing page with hero + connect CTA
   1.2. app/layout.tsx — root layout with fonts, theme provider, sonner toaster
   1.3. app/dashboard/ — bill list for the connected wallet + create form (asset picker: XLM / USDC)
   1.4. app/dashboard/create/ — bill creation flow with participant entry
   1.5. app/bills/[id]/ — bill detail with escrow badge, live participant pills, share link
   1.6. app/pay/[id]/[participantId]/ — per-participant pay page (asset picker, Enable USDC, Pay with Freighter)
   1.7. app/stats/ — public usage metrics (read-only, no auth)

2. app/api/ — Route handlers
   2.1. app/api/health/route.ts — health probe
   2.2. app/api/stats/route.ts — public usage stats from the DB
   2.3. app/api/auth/challenge/route.ts — SEP-10 step 1: build challenge transaction, persist nonce
   2.4. app/api/auth/verify/route.ts — SEP-10 step 2: verify signed tx, open session, set cookie
   2.5. app/api/auth/me/route.ts — return the current session + public key
   2.6. app/api/auth/logout/route.ts — invalidate session, clear cookie
   2.7. app/api/bills/route.ts — POST creates a bill (with participants), GET lists the caller's bills
   2.8. app/api/bills/[id]/route.ts — GET bill + participants + payment history
   2.9. app/api/bills/[id]/pay/build/route.ts — builds an unsigned payment tx (XLM via contract or USDC classic)
   2.10. app/api/bills/[id]/pay/submit/route.ts — submits the signed tx and records the payment row
   2.11. app/api/bills/[id]/pay/route.ts — GET payment status / confirm URL
   2.12. app/api/bills/[id]/stream/route.ts — Horizon-backed SSE for live participant status updates
   2.13. app/api/stellar/trustline/build/route.ts — build a changeTrust op so the wallet can hold USDC
   2.14. app/api/stellar/trustline/submit/route.ts — submit the signed trustline tx

3. src/server/controller/ — thin HTTP request handlers that parse input, call a service, return ok()

4. src/server/service/ — business logic
   4.1. src/server/service/auth.service.ts — SEP-10 challenge build + signature verify + session create
   4.2. src/server/service/bill.service.ts — create bill (split math, open_bill on-chain), getBillWithParticipants, recordPayment, cancel
   4.3. src/server/service/usage.service.ts — aggregates for /api/stats (unique wallets, total logins, bills, participants, shares paid, per-day logins chart)

5. src/server/stellar/ — Stellar SDK helpers
   5.1. src/server/stellar/network.ts — usdcCode, usdcIssuer, usdcAsset, native SAC id resolution
   5.2. src/server/stellar/tx.ts — submit-and-wait wrappers, XDR helpers
   5.3. src/server/stellar/soroban.ts — Contract + SAC client builders for SplitEscrow
   5.4. src/server/stellar/stream.ts — Horizon SSE cursor=paging for the bill event stream
   5.5. src/server/stellar/federation.ts — Stellar address -> public key resolution

6. src/server/config/ — process env + stellar + soroban singletons
   6.1. src/server/config/env.ts — Zod-validated env schema with defaults (USDC issuers per network, network passphrase, RPC URLs, session TTLs)
   6.2. src/server/config/stellar.ts — Horizon Server, Network class, native asset helpers
   6.3. src/server/config/soroban.ts — SorobanRpc.Server, escrowClient, isEscrowEnabled, isEscrowAdminEnabled, minorToStroops

7. src/server/db/ — Drizzle
   7.1. src/server/db/client.ts — pg Pool + drizzle client
   7.2. src/server/db/schema/bills.ts — bills table, BILL_STATUSES enum (open / settling / settled), BILL_ASSETS enum (xlm / usdc)
   7.3. src/server/db/schema/participants.ts — participants table, participant_status enum (pending / paid)
   7.4. src/server/db/schema/billPayments.ts — bill_payments ledger
   7.5. src/server/db/schema/sessions.ts — sessions table (cookie session id -> public key + expiry)
   7.6. src/server/db/schema/authNonces.ts — auth_nonces table (SEP-10 nonce -> public key + expiry + consumed_at)
   7.7. src/server/db/schema/index.ts — barrel export

8. src/server/middleware/ — typed middleware composition
   8.1. src/server/middleware/compose.ts — compose(handler, middlewares[])
   8.2. src/server/middleware/withError.ts — catches AppError + unknown, returns envelope error
   8.3. src/server/middleware/withAuth.ts — requires session cookie, attaches ctx.session
   8.4. src/server/middleware/withOptionalAuth.ts — attaches session if present, allows anon
   8.5. src/server/middleware/withRateLimit.ts — IP-bucket limiter for mutations
   8.6. src/server/middleware/withRateLimitSse.ts — concurrent-connection cap for SSE streams
   8.7. src/server/middleware/withDemoMode.ts — gates demo-only routes behind DEMO_MODE

9. src/server/lib/ — cross-cutting
   9.1. src/server/lib/http.ts — AppError, ok(), created(), badRequest(), envelope types
   9.2. src/server/lib/cookies.ts — session cookie name, secure flag, signing
   9.3. src/server/lib/logger.ts — structured logger
   9.4. src/server/lib/eventBus.ts — in-process pub/sub used to bridge Horizon stream events to SSE clients

10. src/ui/ — UI primitives + Freighter wiring
    10.1. src/ui/components/ConnectWallet.tsx — landing + header connect button, drives SEP-10 flow
    10.2. src/ui/components/EnableUsdc.tsx — the Enable USDC button on the pay page
    10.3. src/ui/hooks/useFreighter.ts — typed wrapper around @stellar/freighter-api
    10.4. src/ui/hooks/useSession.ts — fetches /api/auth/me, exposes useSession()

11. contracts/ — Soroban contract
    11.1. contracts/split-escrow/Cargo.toml — soroban-sdk 22, Rust 1.89.0, wasm32-unknown-unknown target
    11.2. contracts/split-escrow/src/lib.rs — entry points
    11.3. contracts/split-escrow/src/storage.rs — DataKey, TTL bump amounts, instance + bill TTL helpers
    11.4. contracts/split-escrow/src/types.rs — Bill, BillStatus structs
    11.5. contracts/split-escrow/src/error.rs — Error enum (AlreadyInitialized, NotInitialized, InvalidAmount, InvalidShares, InvalidDeadline, Overfunded, BillNotOpen, NotFunded, NotAuthorized, NotContributor, Paused, Expired)
    11.6. contracts/split-escrow/src/test.rs — 10 snapshot tests covering happy path, atomic release, refund after cancel, refund after deadline, pause, overfunding rejection, post-deadline rejection
    11.7. contracts/scripts/deploy.sh — build + optimize + deploy + initialize recipe

12. tests/ — test layers
    12.1. tests/setup.ts — vitest setup, jest-dom matchers, MediaQueryList shim
    12.2. tests/unit/ — pure-logic tests (split math, XDR parsing, nonce validation)
    12.3. tests/component/ — component tests via @testing-library/react
    12.4. tests/e2e/ — Playwright (real Freighter extension via playwright.freighter.config.ts) for SEP-10 sign-in + create bill + pay share happy path


DATA MODEL

1. bills (uuid id PK)
   1.1. creator_public_key text NOT NULL — organizer's Stellar public key
   1.2. title text NOT NULL — display name (Lunch on Tuesday)
   1.3. description text NULL — optional long-form note
   1.4. total_amount_minor text NOT NULL — smallest unit of the asset (stroops for XLM, USDC minor)
   1.5. paid_amount_minor text NOT NULL DEFAULT '0' — running total of funded shares
   1.6. participant_count text NOT NULL DEFAULT '0'
   1.7. status enum NOT NULL DEFAULT 'open' — open | settling | settled
   1.8. asset enum NOT NULL DEFAULT 'xlm' — xlm | usdc
   1.9. network text NOT NULL DEFAULT 'testnet'
   1.10. contract_bill_id text NULL — on-chain SplitEscrow bill id (null for USDC bills or when contract unavailable)
   1.11. contract_open_tx_hash text NULL — tx hash of the open_bill call (escrow-backed bills only)
   1.12. created_at timestamp NOT NULL DEFAULT now()
   1.13. updated_at timestamp NOT NULL DEFAULT now()
   1.14. Indexes: creator_public_key, status

2. participants (uuid id PK)
   2.1. bill_id uuid NOT NULL FK bills.id ON DELETE CASCADE
   2.2. public_key text NOT NULL — participant's Stellar public key
   2.3. display_name text NOT NULL
   2.4. share_minor text NOT NULL — equal share (last participant absorbs the remainder)
   2.5. status enum NOT NULL DEFAULT 'pending' — pending | paid
   2.6. tx_hash text NULL — populated when this participant's share confirms
   2.7. paid_at timestamp NULL
   2.8. created_at timestamp NOT NULL DEFAULT now()
   2.9. Indexes: bill_id, public_key

3. bill_payments (uuid id PK)
   3.1. bill_id uuid NOT NULL FK bills.id ON DELETE CASCADE
   3.2. participant_id uuid NOT NULL FK participants.id ON DELETE CASCADE
   3.3. tx_hash text NOT NULL
   3.4. from_address text NOT NULL
   3.5. amount_minor text NOT NULL
   3.6. created_at timestamp NOT NULL DEFAULT now()

4. sessions (uuid id PK)
   4.1. public_key text NOT NULL
   4.2. created_at timestamp NOT NULL DEFAULT now()
   4.3. expires_at timestamp NOT NULL — 7 day default

5. auth_nonces (text nonce PK)
   5.1. public_key text NOT NULL
   5.2. expires_at timestamp NOT NULL — 5 minute default
   5.3. consumed_at timestamp NULL — set when verify succeeds (one-shot)


STELLAR INTEGRATION

1. SEP-10 AUTHENTICATION (web auth)
   1.1. /api/auth/challenge — builds an unsigned transaction with a ManageData(auth_nonce) operation targeting the user's public key, embeds a server-generated 24-byte base64url nonce
   1.2. nonce is persisted to auth_nonces with a 5 minute TTL
   1.3. /api/auth/verify — receives signedTxXdr, parses with TransactionBuilder.fromXDR against the testnet passphrase, computes sha256(network_id + tx_envelope_xdr) (the standard Stellar tx hash) and verifies with Keypair.fromPublicKey(publicKey).verify(hash, sig)
   1.4. on success: marks nonce consumed_at, opens a sessions row, sets the hatiin_session cookie
   1.5. /api/auth/me and /api/auth/logout complete the loop

2. SOROBAN CONTRACT INVOKE — SplitEscrow
   2.1. contract id CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT
   2.2. entry initialize(admin: Address, token: Address) — one-time setup; stores admin + escrow token SAC id; emits init event
   2.3. entry open_bill(creator: Address, total_amount: i128, num_shares: u32, deadline: u64) -> u32 — admin-signed; opens a bill on-chain; returns the on-chain bill id; emits open event
   2.4. entry pay_share(bill_id: u32, payer: Address, amount: i128) -> i128 — payer-signed via require_auth; transfers XLM from payer to contract via SAC, tracks per-contributor running total, atomically transfers the full pot to creator when funded_amount reaches total_amount; emits pay and (if settled) settle events
   2.5. entry release(bill_id: u32) -> i128 — manual safety valve; explicitly pays the creator when fully funded
   2.6. entry cancel(bill_id: u32) — admin-signed; marks bill cancelled, enabling refund
   2.7. entry refund(bill_id: u32, payer: Address) -> i128 — payer-signed; reclaims the caller's exact contribution from a cancelled or expired bill; emits refund event
   2.8. view get_bill(bill_id: u32) -> Bill, get_contribution(bill_id: u32, payer: Address) -> i128, total_bills() -> u32, get_admin(), get_token(), is_paused()
   2.9. admin pause() / unpause() / set_admin(new_admin: Address) / upgrade(new_wasm_hash: BytesN<32>) — operational safety for mainnet
   2.10. Storage TTL — instance TTL and per-bill TTL are bumped on every write so escrow entries never expire out from under pending contributions or refunds
   2.11. Authorization — require_auth on payer (pay_share, refund) and admin (open_bill, cancel); contract pays out from its own address using the SAC

3. CLASSIC STELLAR PAYMENT — USDC
   3.1. USDC bills settle as a direct payment from payer to creator (no escrow contract, since non-native assets require trustlines the contract flow does not currently cover)
   3.2. Transaction built server-side, signed by the payer in Freighter, submitted to Horizon, polled for confirmation
   3.3. trustline bootstrap: /api/stellar/trustline/build returns a changeTrust op for the USDC issuer; /api/stellar/trustline/submit accepts the signed tx and broadcasts it; the Enable USDC button on the pay page drives this flow one-tap

4. HORIZON SSE — LIVE PARTICIPANT UPDATES
   4.1. /api/bills/[id]/stream opens an SSE stream keyed to a Horizon cursor (cursor=now at stream start) for the bill creator's account payments
   4.2. Incoming payment events are matched to participants by from_address and amount_minor and pushed to all subscribers via the in-process eventBus
   4.3. status flips from pending to paid in the UI on receipt; per-IP concurrency cap (SSE_MAX_CONCURRENT_PER_IP, default 20) prevents abuse
   4.4. Implementation uses a manual fetch + ReadableStream reader, NOT sdk stream() (sdk stream is incompatible with Node 24 streaming under the version pinned)

5. NETWORK AWARENESS
   5.1. STELLAR_NETWORK switches Horizon base URL, Soroban RPC URL, and USDC issuer between testnet and public
   5.2. Contract id is parameterized via SOROBAN_SPLIT_CONTRACT_ID so a redeploy on public mainnet is a config change, not a code change


KEY FLOWS

1. CONNECT WALLET (SEP-10)
   1.1. User clicks Connect with Freighter in src/ui/components/ConnectWallet.tsx
   1.2. Client calls useFreighter.requestAccess() — Freighter shows a popup, returns the user's ed25519 public key
   1.3. Client POSTs { publicKey } to /api/auth/challenge
   1.4. Server (authService.createChallenge) validates StrKey.isValidEd25519PublicKey, generates a 24-byte base64url nonce, persists to auth_nonces with 5 minute TTL, builds an unsigned Transaction with Operation.manageData({ name: 'auth_nonce', value: Buffer.from(nonce) }) against the testnet passphrase, returns { nonce, txXdr, expiresAt }
   1.5. Client passes txXdr to useFreighter.signTransaction(txXdr, { networkPassphrase }) — Freighter shows the user what they are signing and produces signedTxXdr
   1.6. Client POSTs { publicKey, signedTxXdr } to /api/auth/verify
   1.7. Server (authService.verifyAndCreateSession) parses the signed tx with TransactionBuilder.fromXDR(passphrase), computes sha256(network_id + envelope_xdr) as the Stellar tx hash, walks tx.signatures to find one that verifies against the user's public key
   1.8. On match: nonce.consumed_at = now(), insert sessions row with 7 day TTL, return { sessionId }
   1.9. Middleware sets the hatiin_session cookie (HttpOnly, Secure in production); subsequent requests use withAuth or withOptionalAuth

2. CREATE BILL (OPEN ON-CHAIN FOR XLM)
   2.1. User on /dashboard/create submits the form — title, total, asset (XLM or USDC), list of participants (display name + Stellar address)
   2.2. Client POSTs to /api/bills; withAuth middleware reads the session cookie
   2.3. billService.create(creatorPublicKey, input) computes equal shares (total / count, last participant absorbs the remainder)
   2.4. Server inserts bills row + participants rows in one transaction
   2.5. If asset is xlm and SOROBAN_SPLIT_CONTRACT_ID + SOROBAN_ADMIN_SECRET are set, server invokes SplitEscrow.open_bill(creator, total_amount, num_shares, deadline) signed by the deployer key via Soroban RPC, waits for confirmation, persists contract_bill_id and contract_open_tx_hash
   2.6. If the contract is unavailable or the call fails, the bill is still created with contract_bill_id = null (XLM bills fall back to classic Horizon payment in that case)
   2.7. Response returns the bill + participants; UI redirects to /bills/[id]

3. PAY A SHARE (XLM VIA SPLITESCROW)
   3.1. Each participant receives a deep link to /pay/[id]/[participantId]
   3.2. Pay page calls /api/bills/[id]/pay/build with { participantId } to get an UNSIGNED Soroban invoke host function for pay_share(bill_id, payer, amount)
   3.3. Client passes the invoke XDR to Freighter via useFreighter.signTransaction; Freighter shows the user the contract call, asset, amount, and destination (the contract), then returns signedXdr
   3.4. Client POSTs signedXdr + txHash (computed client-side from the signed envelope) to /api/bills/[id]/pay/submit
   3.5. Server (billService.recordPayment) submits the signed tx via Soroban RPC, waits for the result, inserts a bill_payments row, flips the participant row to status='paid' with tx_hash and paid_at
   3.6. Server-side eventBus emits a payment event; all SSE subscribers for this bill id flip the participant pill to paid and, if this was the funding share, flip the whole bill to settled in the UI
   3.7. If the contract's atomic fund-and-release fires in this same call, settle event arrives and the dashboard shows settled in real time

4. PAY A SHARE (USDC VIA CLASSIC PAYMENT)
   4.1. Same flow up to /pay/build, but the server builds a classic Stellar payment (Asset USDC + issuer) from payer to creator for amount = share_minor
   4.2. Freighter signs, client POSTs signedXdr to /pay/submit which broadcasts via Horizon and polls for confirmation
   4.3. If the wallet lacks a USDC trustline, the pay page surfaces an Enable USDC button that drives /api/stellar/trustline/build + submit (changeTrust op to the USDC issuer) before retrying

5. CANCEL A BILL AND REFUND
   5.1. Organizer on /bills/[id] clicks Cancel; server invokes SplitEscrow.cancel(bill_id) signed by the deployer
   5.2. Each participant can then click Refund on the pay page; server invokes SplitEscrow.refund(bill_id, payer) signed by the participant; their exact contribution comes back from the contract's balance

6. STATS — PUBLIC USAGE PAGE
   6.1. /stats page calls /api/stats (no auth required)
   6.2. usageService aggregates in one round-trip:
      6.2.1. unique wallets (COUNT DISTINCT sessions.public_key)
      6.2.2. total logins (COUNT sessions)
      6.2.3. bills created (COUNT bills)
      6.2.4. participants added (COUNT participants)
      6.2.5. shares paid (COUNT participants WHERE status='paid')
      6.2.6. per-day logins chart (GROUP BY DATE(sessions.created_at) for the last 14 days)
   6.3. Response is cached briefly at the edge; UI renders counters + a sparkline

7. LIVE PARTICIPANT STATUS (SSE)
   7.1. Client opens EventSource('/api/bills/[id]/stream'); middleware applies withRateLimitSse and auth-or-optional-auth
   7.2. Server src/server/stellar/stream.ts calls Horizon /accounts/{creator}/payments?cursor=now, holds the response body, reads chunks as a stream
   7.3. Each 'data: {...}' line is parsed; if amount + from_address matches a pending participant, the participant is updated to paid in the DB and an eventBus message is published
   7.4. The SSE handler subscribes to the eventBus and writes matching events to the response stream as 'event: participant_paid\ndata: {...}\n\n'
   7.5. Heartbeats every SSE_HEARTBEAT_MS (default 15s) keep the connection alive through proxies


ENVIRONMENT VARIABLES

1. NODE_ENV — development | test | production (default development)
2. NEXT_PUBLIC_APP_NAME — display name (default Hatiin)
3. NEXT_PUBLIC_APP_URL — public base URL (default http://localhost:3002)
4. DRIZZLE_DATABASE_URL — Postgres connection string (no default; required)
5. STELLAR_NETWORK — testnet | public | futurenet (default testnet)
6. STELLAR_HORIZON_URL — Horizon base URL (default testnet)
7. STELLAR_NETWORK_PASSPHRASE — network passphrase (default Test SDF Network ; September 2015)
8. SOROBAN_RPC_URL — Soroban RPC endpoint (default testnet)
9. SOROBAN_SPLIT_CONTRACT_ID — deployed SplitEscrow contract id (optional; if unset XLM bills fall back to classic payment)
10. SOROBAN_TOKEN_CONTRACT_ID — escrow token SAC id (default native XLM SAC on testnet)
11. SOROBAN_ADMIN_SECRET — deployer secret that signs open_bill and cancel server-side (optional; server-side admin ops are skipped if unset)
12. SOROBAN_BILL_TTL_DAYS — on-chain deadline for unfunded bills in days (default 30)
13. SESSION_SECRET — cookie signing secret, min 32 chars (required)
14. SESSION_COOKIE_NAME — cookie name (default hatiin_session)
15. SESSION_TTL_SECONDS — session lifetime (default 604800 = 7 days)
16. NONCE_TTL_SECONDS — SEP-10 nonce lifetime (default 300 = 5 minutes)
17. HORIZON_STREAM_ENABLED — use Horizon SSE for payment detection (default true)
18. SSE_HEARTBEAT_MS — heartbeat interval (default 15000)
19. SSE_MAX_CONCURRENT_PER_IP — concurrency cap per IP (default 20)
20. DEMO_MODE — mount demo routes (default false)
21. USDC_ASSET_CODE — USDC code (default USDC)
22. USDC_ASSET_ISSUER_TESTNET — testnet USDC issuer
23. USDC_ASSET_ISSUER_PUBLIC — mainnet USDC issuer

Secret values (DRIZZLE_DATABASE_URL, SESSION_SECRET, SOROBAN_ADMIN_SECRET) must never be committed; this doc references them by name only.


DEPLOY

1. Vercel
   1.1. Project name: hatiin
   1.2. Vercel project id: prj_6FxWVlLlcR8jINHYAhJ0hFPHoZzD
   1.3. Vercel org (team) id: team_eqrxYAJNb8f2yCEjwHhAHaR6
   1.4. Framework preset: nextjs
   1.5. Node version: 24.x
   1.6. Production URL: https://hatiin.vercel.app
   1.7. Dev command: pnpm run dev (binds to port 3002 via next.config.ts)
   1.8. Build command: pnpm run build
   1.9. Environment variables set in Vercel dashboard for production, preview, and development scopes

2. Supabase Postgres
   2.1. Database name: hatiin (production)
   2.2. Connection string is set as DRIZZLE_DATABASE_URL in Vercel
   2.3. db:push applied via CI on deploy

3. Key URLs
   3.1. App: https://hatiin.vercel.app
   3.2. Stats: https://hatiin.vercel.app/stats
   3.3. Contract explorer: https://stellar.expert/explorer/testnet/contract/CDQZZNL47YE3YAB3LU3NAJMAHFR4BBVFPISQAUOQZMMVRRDF6R2GPRBT
   3.4. Init tx: https://stellar.expert/explorer/testnet/tx/5b3b97e14c6c61585d763b55544530215d937c09888c86d3a515695ef0130d3b


LIMITATIONS AND KNOWN GAPS

1. USDC BILLS DO NOT USE THE ESCROW
   1.1. The SplitEscrow contract only holds the native XLM SAC. USDC bills settle as direct classic payments from payer to creator. There is no on-chain USDC escrow and no atomic release for USDC. To support a USDC escrow the contract would need a per-asset token registry plus a token Authorization.transferFrom flow (issuer-side trust), which is not implemented.

2. NO ORGANIZER ROLES OR PERMISSIONS
   2.1. Anyone with a Stellar address can be the organizer (creator_public_key). Anyone can read any bill by id — bill detail and pay page are public, keyed by uuid. There is no ownership check on /api/bills/[id] PATCH or DELETE because there is no such endpoint; cancellation is the only mutating path and it uses the deployer key, not the creator's.

3. NO EQUAL-SPLIT ALTERNATIVES
   3.1. The split math is total / count with the remainder dropped on the last participant. There is no custom-share editor, no weights, no itemized split. The share_minor column is a single number per participant, not a list.

4. NO BILL EXPIRY UI
   4.1. SOROBAN_BILL_TTL_DAYS sets the on-chain deadline, but the app does not surface expiry as a countdown or auto-cancel. A bill that nobody funds just stays open on-chain until SOROBAN_BILL_TTL_DAYS pass, at which point contributors can manually call refund on the pay page. There is no cron or scheduled job that issues cancel.

5. NO NOTIFICATIONS
   5.1. Participants learn they have a bill to pay only because the organizer sends them a link (pay page deep link or QR). There is no email, push, or webhook. There is no notification back to the organizer when each share is paid beyond the SSE event on whatever tabs happen to be open.

6. NO PRODUCTION-READY MAINNET DEPLOYMENT
   6.1. Network is hard-pinned to testnet defaults. Switching to mainnet requires:
      6.1.1. Setting STELLAR_NETWORK=public, STELLAR_HORIZON_URL, SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE in Vercel
      6.1.2. Redeploying SplitEscrow against public mainnet via contracts/scripts/deploy.sh --network public
      6.1.3. Updating SOROBAN_SPLIT_CONTRACT_ID to the new mainnet contract id
      6.1.4. Funding the deployer key with mainnet XLM
   6.2. There is no documented runbook for this yet.

7. NO MIGRATION FILES
   7.1. Schema is applied via pnpm db:push (drizzle-kit push --force). There are no SQL migration files committed; rollback is manual. Production schema changes are not safe to roll back without manual intervention.

8. SSE STREAM SCOPE IS CREATOR-ONLY PAYMENTS
   8.1. The Horizon stream for /api/bills/[id]/stream watches the creator's account. For XLM bills the contract address is the destination, not the creator, so payment detection currently relies on the eventBus bridge from /api/bills/[id]/pay/submit rather than Horizon stream. The stream is mostly a fallback / USDC detection path and will miss XLM contract payments unless the contract emits to the creator account too. Production hardening would listen to the contract address instead.

9. NO FILE UPLOADS, RECEIPTS, OR PROOF
   9.1. There is no image upload, no receipt parsing, no OCR. The title and description are free text only.

10. RATE LIMITS ARE PER-IP, NOT PER-WALLET
    10.1. withRateLimit is keyed on request IP. A single wallet across multiple IPs (mobile networks, VPN) is not deduplicated. A malicious actor rotating IPs can bypass the limiter.

11. NO ACCESSIBILITY AUDIT IS AUTOMATED IN CI
    11.1. @axe-core/playwright is installed but not wired into a CI step. Accessibility checks run only on demand.

12. FREIGHTER ONLY
    12.1. The only supported wallet is Freighter. There is no Lobstr, no Albedo, no WalletConnect, no xBull. Users without Freighter installed cannot connect.

13. NO ANALYTICS OR TELEMETRY
    13.1. The only usage signal is /api/stats, which reads the database directly. There is no event stream to an external analytics system, no error reporting (no Sentry), no performance tracing.