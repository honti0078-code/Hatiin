export const dynamic = 'force-dynamic';

import { BASE_FEE, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { stellar } from '@/server/config/stellar';
import { AppError, ok } from '@/server/lib/http';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { usdcAsset, usdcCode, usdcIssuer } from '@/server/stellar/network';

const schema = z.object({
  publicKey: z
    .string()
    .refine((v) => v.length === 56 && StrKey.isValidEd25519PublicKey(v), 'INVALID_PUBLIC_KEY'),
});

/**
 * Build an UNSIGNED `changeTrust` transaction so the given account can hold (and
 * therefore receive) USDC. The client signs it with Freighter and submits via
 * the sibling `submit` route. This is how a bill creator "enables USDC" on their
 * wallet to avoid the `op_no_trust` rejection.
 */
async function buildTrustline(req: NextRequest) {
  const { publicKey } = schema.parse(await req.json());

  // The issuer itself never needs a trustline to its own asset.
  if (publicKey === usdcIssuer()) {
    throw new AppError(
      'CONFLICT',
      'This account is the USDC issuer — it does not need a trustline.',
      422,
    );
  }

  let account: Awaited<ReturnType<typeof stellar.server.loadAccount>>;
  try {
    account = await stellar.server.loadAccount(publicKey);
  } catch {
    throw new AppError(
      'NOT_FOUND',
      `Account is not active on Stellar ${stellar.network} yet. Fund it first (testnet friendbot), then enable USDC.`,
      404,
    );
  }

  // Already has the trustline — nothing to do.
  const code = usdcCode();
  const issuer = usdcIssuer();
  const alreadyTrusts = account.balances.some(
    (b) =>
      'asset_code' in b && b.asset_code === code && 'asset_issuer' in b && b.asset_issuer === issuer,
  );
  if (alreadyTrusts) {
    throw new AppError('CONFLICT', 'USDC is already enabled on this account.', 409);
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: stellar.passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: usdcAsset() }))
    .setTimeout(180)
    .build();

  return ok({ xdr: tx.toXDR(), assetCode: code, issuer });
}

export const POST = compose(withError, withRateLimit)(buildTrustline);
