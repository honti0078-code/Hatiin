export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { billService } from '@/server/service/bill.service';
import type { HandlerContext } from '@/server/middleware/compose';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { ok } from '@/server/lib/http';
import { usdcCode, usdcIssuer } from '@/server/stellar/network';

async function getBill(req: NextRequest, ctx: HandlerContext) {
  const params = await ctx.params;
  const id = params?.id as string;
  const bill = await billService.getBillWithParticipants(id);
  const participants = bill.participants.map((participant) => ({
    ...participant,
    paymentUri: billService.buildPaymentUri(bill, participant),
  }));
  // Ship the active USDC asset identity so the client can build correct SEP-7
  // QR URIs without hardcoding an issuer.
  return ok({
    bill: { ...bill, participants },
    usdc: { code: usdcCode(), issuer: usdcIssuer() },
  });
}

export const GET = compose(withError, withRateLimit)(getBill);
