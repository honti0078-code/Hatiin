export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { eventBus } from '@/server/lib/eventBus';
import { env } from '@/server/config/env';
import type { HandlerContext } from '@/server/middleware/compose';

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

export const GET = compose(withError)(streamBillUpdates);
