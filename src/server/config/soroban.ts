import { env } from './env';
import { stellar } from './stellar';
import { SplitEscrowClient } from '@/server/stellar/soroban';

/**
 * Resolved configuration for the on-chain SplitEscrow contract. The contract is
 * the real on-chain core of an XLM bill: participants fund their shares into it
 * and it releases the pot to the creator once fully funded.
 *
 * The escrow token is the native XLM Stellar Asset Contract (SAC) — 7 decimals
 * (stroops). The app stores amounts as 6-decimal "minor" units, so contract
 * amounts are scaled by 10.
 */
export const soroban = {
  rpcUrl: env.SOROBAN_RPC_URL,
  contractId: env.SOROBAN_SPLIT_CONTRACT_ID,
  tokenId: env.SOROBAN_TOKEN_CONTRACT_ID,
  adminSecret: env.SOROBAN_ADMIN_SECRET,
  billTtlDays: env.SOROBAN_BILL_TTL_DAYS,
  networkPassphrase: stellar.passphrase as string,
} as const;

let _client: SplitEscrowClient | null = null;

/** Lazily-built singleton client. Throws if the contract id is not configured. */
export function escrowClient(): SplitEscrowClient {
  if (!soroban.contractId) {
    throw new Error('SOROBAN_SPLIT_CONTRACT_ID is not configured');
  }
  if (!_client) {
    _client = new SplitEscrowClient({
      rpcUrl: soroban.rpcUrl,
      contractId: soroban.contractId,
      networkPassphrase: soroban.networkPassphrase,
    });
  }
  return _client;
}

/** The contract can open/cancel bills only if both id and admin secret exist. */
export function isEscrowAdminEnabled(): boolean {
  return Boolean(soroban.contractId && soroban.adminSecret);
}

/** True when an XLM bill should route through the on-chain escrow. */
export function isEscrowEnabled(): boolean {
  return Boolean(soroban.contractId);
}

/** Convert a 6-decimal "minor" amount (app DB) to 7-decimal stroops (XLM SAC). */
export function minorToStroops(minor: string | bigint): bigint {
  return BigInt(minor) * 10n;
}
