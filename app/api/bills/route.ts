export const dynamic = 'force-dynamic';
// Creating an XLM bill opens it on-chain (Soroban open_bill) which can take
// several seconds incl. shared-key retries — allow up to 60s on Vercel.
export const maxDuration = 60;

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { compose } from '@/server/middleware/compose';
import { withAuth } from '@/server/middleware/withAuth';
import { withOptionalAuth } from '@/server/middleware/withOptionalAuth';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { AppError } from '@/server/lib/http';
import { billService } from '@/server/service/bill.service';
import { isResolvableStellarAddress, resolveFederation } from '@/server/stellar/federation';
import type { HandlerContext } from '@/server/middleware/compose';
import { created, ok } from '@/server/lib/http';

// Accepts a raw Stellar public key (G...) or a SEP-2 federation address
// (name*domain.com) — resolveFederation() turns either into a real public key.
const publicKeySchema = z.string().refine(isResolvableStellarAddress, {
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

const listBillsSchema = z.object({
  status: z.enum(['open', 'settling', 'settled']).optional(),
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

async function getBills(req: NextRequest, ctx: HandlerContext) {
  const publicKey = ctx.publicKey as string;
  const query = listBillsSchema.parse({
    status: req.nextUrl.searchParams.get('status') ?? undefined,
    cursor: req.nextUrl.searchParams.get('cursor') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  });
  const { bills, nextCursor } = await billService.listByCreator(publicKey, query);
  return ok({ bills, nextCursor });
}

async function createBill(req: NextRequest, ctx: HandlerContext) {
  const body = createBillSchema.parse(await req.json());
  // Creator address comes from the body (anonymous flow) or, if absent, from a
  // connected session. Wallet connection is optional — a typed address is enough.
  const creatorInput = body.creatorPublicKey ?? (ctx.publicKey as string | undefined);
  if (!creatorInput) {
    throw new AppError('INVALID_INPUT', 'A creator receiving address is required', 400);
  }
  // Every address may be a raw public key or a SEP-2 federation name
  // (e.g. alice*example.com) — resolve them all to real public keys before
  // they ever reach the database.
  const creatorPublicKey = (await resolveFederation(creatorInput)).account;
  const participants = await Promise.all(
    body.participants.map(async (p) => ({
      ...p,
      publicKey: (await resolveFederation(p.publicKey)).account,
    })),
  );
  const bill = await billService.create(creatorPublicKey, { ...body, participants });
  return created({ bill });
}

export const GET = compose(withError, withAuth)(getBills);
export const POST = compose(withError, withOptionalAuth, withRateLimit)(createBill);
