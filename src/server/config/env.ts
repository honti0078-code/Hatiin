import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  NEXT_PUBLIC_APP_NAME: z.string().default('Hatiin'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3002'),

  DRIZZLE_DATABASE_URL: z.string().url(),

  STELLAR_NETWORK: z.enum(['testnet', 'public', 'futurenet']).default('testnet'),
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),

  /** Soroban RPC endpoint for the SplitEscrow contract. */
  SOROBAN_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  /** Deployed SplitEscrow contract id (C...). When unset, XLM bills fall back
   *  to a classic Horizon payment so the app never breaks. */
  SOROBAN_SPLIT_CONTRACT_ID: z.string().optional(),
  /** Stellar Asset Contract id for the escrow token (native XLM SAC on testnet). */
  SOROBAN_TOKEN_CONTRACT_ID: z
    .string()
    .default('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),
  /** Admin/deployer secret used to open + cancel bills on-chain, server-side. */
  SOROBAN_ADMIN_SECRET: z.string().optional(),
  /** Days until an unfunded bill becomes refundable (on-chain deadline). */
  SOROBAN_BILL_TTL_DAYS: z.coerce.number().int().positive().default(30),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  SESSION_COOKIE_NAME: z.string().default('hatiin_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  /** When true, use Horizon SSE stream for payment detection; otherwise poll only. */
  HORIZON_STREAM_ENABLED: z.coerce.boolean().default(true),
  /** Heartbeat interval for SSE connections. */
  SSE_HEARTBEAT_MS: z.coerce.number().int().positive().default(15_000),
  /** Max concurrent SSE streams per IP. */
  SSE_MAX_CONCURRENT_PER_IP: z.coerce.number().int().positive().default(20),
  /** Mount demo routes. */
  DEMO_MODE: z.coerce.boolean().default(false),

  /** USDC asset configuration. */
  USDC_ASSET_CODE: z.string().default('USDC'),
  USDC_ASSET_ISSUER_TESTNET: z
    .string()
    .default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  USDC_ASSET_ISSUER_PUBLIC: z
    .string()
    .default('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

const rawEnv = parsed.data;

/**
 * Resolved USDC issuer for the active Stellar network.
 */
export const USDC_ASSET_ISSUER_VALUE: string = (() => {
  if (rawEnv.STELLAR_NETWORK === 'public') return rawEnv.USDC_ASSET_ISSUER_PUBLIC;
  return rawEnv.USDC_ASSET_ISSUER_TESTNET;
})();

export const env = rawEnv;
export type Env = typeof env;
