export const dynamic = 'force-dynamic';
// Creating an XLM bill opens it on-chain (Soroban open_bill) which can take
// several seconds incl. shared-key retries — allow up to 60s on Vercel.
export const maxDuration = 60;

import { StrKey } from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { compose } from '@/server/middleware/compose';
import { withAuth } from '@/server/middleware/withAuth';
import { withOptionalAuth } from '@/server/middleware/withOptionalAuth';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { AppError } from '@/server/lib/http';
import { billService } from '@/server/service/bill.service';
import type { HandlerContext } from '@/server/middleware/compose';
import { created, ok } from '@/server/lib/http';

const publicKeySchema = z
  .string()
  .refine((v) => v.length === 56 && StrKey.isValidEd25519PublicKey(v), {
    message: 'INVALID_PUBLIC_KEY',
  });

const createBillSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  // Creator's Stellar receiving address — where participants send their share.
  // Optional in the body: if omitted, the authenticated session's key is used.
  creatorPublicKey: publicKeySchema.optional(),
  totalAmountMinor: z.string().regex(/^\d+$/, 'Must be integer string'),
  // Settlement asset for the bill. Native XLM (no trustline) or USDC. Defaults
  // to XLM so any funded wallet can settle out of the box; USDC is opt-in.
  asset: z.enum(['usdc', 'xlm']).default('xlm'),
  participants: z
    .array(
      z.object({
        publicKey: publicKeySchema,
        displayName: z.string().min(1).max(50),
      }),
    )
    .min(1)
    .max(20),
});

async function getBills(_req: NextRequest, ctx: HandlerContext) {
  const publicKey = ctx.publicKey as string;
  const myBills = await billService.getByCreator(publicKey);
  return ok({ bills: myBills });
}

async function createBill(req: NextRequest, ctx: HandlerContext) {
  const body = createBillSchema.parse(await req.json());
  // Creator address comes from the body (anonymous flow) or, if absent, from a
  // connected session. Wallet connection is optional — a typed address is enough.
  const creatorPublicKey = body.creatorPublicKey ?? (ctx.publicKey as string | undefined);
  if (!creatorPublicKey) {
    throw new AppError('INVALID_INPUT', 'A creator receiving address is required', 400);
  }
  const bill = await billService.create(creatorPublicKey, body);
  return created({ bill });
}

export const GET = compose(withError, withAuth)(getBills);
export const POST = compose(withError, withOptionalAuth, withRateLimit)(createBill);
