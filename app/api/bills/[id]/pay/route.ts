export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { billService } from '@/server/service/bill.service';
import type { HandlerContext } from '@/server/middleware/compose';
import { ok } from '@/server/lib/http';

const paySchema = z.object({
  participantId: z.string().uuid(),
  txHash: z.string().min(60).max(70),
  fromAddress: z.string().min(56).max(56),
  amountMinor: z.string().regex(/^\d+$/),
});

async function recordPayment(req: NextRequest, ctx: HandlerContext) {
  const params = await ctx.params;
  const billId = params?.id as string;
  const body = paySchema.parse(await req.json());
  const result = await billService.recordPayment(billId, body.participantId, {
    txHash: body.txHash,
    fromAddress: body.fromAddress,
    amountMinor: body.amountMinor,
  });
  return ok({ bill: result.bill, participant: result.participant });
}

export const POST = compose(withError, withRateLimit)(recordPayment);
