import { Asset, Networks } from '@stellar/stellar-sdk';
import { env, USDC_ASSET_ISSUER_VALUE } from '@/server/config/env';

export type StellarNetwork = 'testnet' | 'public' | 'futurenet';

export function getNetworkPassphrase(): string {
  // Allow override via env for custom networks; otherwise use the SDK enum.
  if (
    env.STELLAR_NETWORK_PASSPHRASE &&
    env.STELLAR_NETWORK_PASSPHRASE !== 'Test SDF Network ; September 2015'
  ) {
    return env.STELLAR_NETWORK_PASSPHRASE;
  }
  const map: Record<StellarNetwork, string> = {
    testnet: Networks.TESTNET,
    public: Networks.PUBLIC,
    futurenet: Networks.FUTURENET,
  };
  return map[env.STELLAR_NETWORK];
}

export function getHorizonUrl(): string {
  return env.STELLAR_HORIZON_URL;
}

export function usdcAsset(): Asset {
  return new Asset(env.USDC_ASSET_CODE, USDC_ASSET_ISSUER_VALUE);
}

export function usdcIssuer(): string {
  return USDC_ASSET_ISSUER_VALUE;
}

export function usdcCode(): string {
  return env.USDC_ASSET_CODE;
}
