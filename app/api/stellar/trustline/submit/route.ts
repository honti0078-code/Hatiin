export const dynamic = 'force-dynamic';

import { TransactionBuilder } from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { stellar } from '@/server/config/stellar';
import { AppError, ok } from '@/server/lib/http';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';

const schema = z.object({ signedXdr: z.string().min(1) });

/**
 * Submit a Freighter-signed `changeTrust` (enable USDC) transaction to Horizon.
 */
async function submitTrustline(req: NextRequest) {
  const { signedXdr } = schema.parse(await req.json());

  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, stellar.passphrase);
  } catch {
    throw new AppError('INVALID_INPUT', 'Invalid signed transaction XDR', 400);
  }

  try {
    const result = await stellar.server.submitTransaction(
      // biome-ignore lint/suspicious/noExplicitAny: SDK union vs Transaction
      tx as any,
    );
    return ok({ txHash: result.hash });
  } catch (err) {
    const codes =
      (err as { response?: { data?: { extras?: { result_codes?: { operations?: string[] } } } } })
        ?.response?.data?.extras?.result_codes ?? null;
    const ops = codes?.operations ?? [];
    if (ops.includes('op_low_reserve')) {
      throw new AppError(
        'CONFLICT',
        'Not enough XLM to cover the trustline reserve (~0.5 XLM). Fund your wallet and try again.',
        422,
      );
    }
    throw new AppError(
      'CONFLICT',
      `Stellar rejected enabling USDC${codes ? `: ${JSON.stringify(codes)}` : ''}.`,
      422,
    );
  }
}

export const POST = compose(withError, withRateLimit)(submitTrustline);
