export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimitSse } from '@/server/middleware/withRateLimitSse';
import { eventBus } from '@/server/lib/eventBus';
import { env } from '@/server/config/env';
import type { HandlerContext } from '@/server/middleware/compose';
import { billService } from '@/server/service/bill.service';
import { watchAccountPayments } from '@/server/stellar/stream';
import { findMatchingParticipant, horizonAmountToMinor } from '@/server/stellar/paymentMatch';
import { logger } from '@/server/lib/logger';

async function streamBillUpdates(req: NextRequest, ctx: HandlerContext) {
  const params = await ctx.params;
  const billId = params?.id as string;

  const encoder = new TextEncoder();
  const heartbeatMs = env.SSE_HEARTBEAT_MS;

  const stream = new ReadableStream({
    start(controller) {
      const abort = new AbortController();

      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      // Send initial connection event
      send({ type: 'connected', billId });

      // Subscribe to bill updates
      const unsubBill = eventBus.subscribe(
        'bill.updated',
        (event) => {
          if (event.billId !== billId) return;
          send({ type: 'bill.updated', ...event });
        },
        abort.signal,
      );

      // Subscribe to participant payments
      const unsubParticipant = eventBus.subscribe(
        'participant.paid',
        (event) => {
          if (event.billId !== billId) return;
          send({ type: 'participant.paid', ...event });
        },
        abort.signal,
      );

      // A bill's SEP-7 QR code lets any Stellar wallet pay the creator
      // directly, bypassing the app's own POST /pay/submit entirely. Without
      // this, that payment would land on-chain but the bill would stay
      // "pending" forever. While a client has this stream open, watch the
      // creator's account for a matching classic payment (contract-backed
      // XLM bills settle on-chain instead, via pay_share) and record it.
      if (env.HORIZON_STREAM_ENABLED) {
        billService
          .getBillWithParticipants(billId)
          .then((bill) => {
            if (bill.status === 'settled' || bill.contractBillId) return;
            watchAccountPayments({
              destination: bill.creatorPublicKey,
              asset: bill.asset,
              signal: abort.signal,
              onMatch: async (payment) => {
                const current = await billService.getBillWithParticipants(billId);
                if (current.status === 'settled') {
                  abort.abort();
                  return;
                }
                const amountMinor = horizonAmountToMinor(payment.amount);
                const match = findMatchingParticipant(current.participants, amountMinor);
                if (!match) return;
                try {
                  await billService.recordPayment(billId, match.id, {
                    txHash: payment.txHash,
                    fromAddress: payment.from,
                    amountMinor: match.shareMinor,
                  });
                } catch (err) {
                  logger.warn('bill.stream.payment_detected_but_not_recorded', {
                    billId,
                    participantId: match.id,
                    err: err instanceof Error ? err.message : String(err),
                  });
                }
              },
            }).catch((err) => {
              logger.warn('bill.stream.watch_failed', { billId, err: String(err) });
            });
          })
          .catch(() => {
            // Bill lookup failed — DB-driven SSE events still work.
          });
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, heartbeatMs);

      // Cleanup on disconnect
      req.signal.addEventListener('abort', () => {
        abort.abort();
        unsubBill();
        unsubParticipant();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export const GET = compose(withError, withRateLimitSse)(streamBillUpdates);
