import { AppError } from '@/server/lib/http';
import { logger } from '@/server/lib/logger';
import { getHorizonUrl, usdcCode, usdcIssuer } from './network';
import type { HorizonPayment } from './tx';

/**
 * Streaming / polling payment detection for a single Stellar account.
 *
 * - The stream path uses a manual SSE client against `/accounts/{id}/payments`
 *   (Horizon's stream endpoint). We avoid the SDK's `callBuilder.stream` because
 *   it pulls in `EventSource` polyfills that have proven flaky on serverless.
 * - The polling path uses `/payments?account=...` with `cursor` pagination and
 *   runs on a fixed interval as a backstop in case the stream drops.
 *
 * The caller receives each new payment exactly once. De-duplication is the
 * caller's responsibility (e.g. unique index on `(chain, source_tx_hash)`).
 */

export type DetectedPayment = {
  txHash: string;
  paymentId: string;
  from: string;
  to: string;
  amount: string;
  assetCode: string;
  assetIssuer: string;
  createdAt: Date;
};

export type WatchOptions = {
  /** Filter to a specific destination. */
  destination: string;
  /** Filter to USDC only (default true). */
  usdcOnly?: boolean;
  /** Cursor to resume from (optional). */
  cursor?: string;
  /** Max consecutive stream errors before falling back to polling. */
  maxStreamRetries?: number;
  /** Polling interval in ms when stream is unavailable. */
  pollIntervalMs?: number;
  /** Abort signal — caller can stop the watcher. */
  signal: AbortSignal;
  /** Sink for detected payments. */
  onMatch: (payment: DetectedPayment) => Promise<void> | void;
};

type StreamEnvelope = {
  id: string;
  paging_token: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  from: string;
  to: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
};

function isUsdc(p: StreamEnvelope): boolean {
  return (
    p.asset_type !== 'native' && p.asset_code === usdcCode() && p.asset_issuer === usdcIssuer()
  );
}

function toDetected(p: StreamEnvelope): DetectedPayment {
  return {
    txHash: p.transaction_hash,
    paymentId: p.id,
    from: p.from,
    to: p.to,
    amount: p.amount,
    assetCode: p.asset_code ?? usdcCode(),
    assetIssuer: p.asset_issuer ?? usdcIssuer(),
    createdAt: new Date(p.created_at),
  };
}

export async function watchAccountPayments(opts: WatchOptions): Promise<void> {
  const usdcOnly = opts.usdcOnly ?? true;
  const maxRetries = opts.maxStreamRetries ?? 3;
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;

  let streamFailures = 0;
  // Default to 'now' so the watcher only picks up payments made after it
  // starts, preventing historical payments from matching new invoices.
  let cursor = opts.cursor ?? 'now';
  let mode: 'stream' | 'polling' = 'stream';

  while (!opts.signal.aborted) {
    if (mode === 'stream') {
      try {
        await runStream({
          destination: opts.destination,
          usdcOnly,
          cursor,
          signal: opts.signal,
          onMatch: opts.onMatch,
        });
        // Stream ended cleanly (server closed) — fall through to retry.
      } catch (err) {
        streamFailures += 1;
        logger.warn('stellar.stream.error', {
          err: String(err),
          destination: opts.destination,
          attempt: streamFailures,
        });
        if (streamFailures >= maxRetries) {
          logger.info('stellar.stream.fallback_polling', { destination: opts.destination });
          mode = 'polling';
        }
      }
    } else {
      const next = await runPoll({
        destination: opts.destination,
        usdcOnly,
        cursor,
        signal: opts.signal,
        onMatch: opts.onMatch,
      });
      cursor = next;
      // Wait for next poll tick.
      await sleepWithAbort(pollIntervalMs, opts.signal);
    }
  }
}

async function runStream(opts: {
  destination: string;
  usdcOnly: boolean;
  cursor: string | undefined;
  signal: AbortSignal;
  onMatch: (p: DetectedPayment) => Promise<void> | void;
}): Promise<void> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  params.set('limit', '50');
  const url = `${getHorizonUrl().replace(/\/$/, '')}/accounts/${opts.destination}/payments?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new AppError('INTERNAL', `Stream returned ${res.status}`, 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (!opts.signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    // SSE frames are separated by `\n\n`. We only care about `data:` payloads.
    for (;;) {
      idx = buffer.indexOf('\n\n');
      if (idx === -1) break;
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine) as StreamEnvelope;
        if (parsed.type !== 'payment') continue;
        if (opts.usdcOnly && !isUsdc(parsed)) continue;
        if (parsed.to !== opts.destination) continue;
        await opts.onMatch(toDetected(parsed));
      } catch {
        // ignore parse errors
      }
    }
  }
}

async function runPoll(opts: {
  destination: string;
  usdcOnly: boolean;
  cursor: string | undefined;
  signal: AbortSignal;
  onMatch: (p: DetectedPayment) => Promise<void> | void;
}): Promise<string> {
  const params = new URLSearchParams();
  params.set('account', opts.destination);
  params.set('limit', '50');
  params.set('order', 'asc');
  if (opts.cursor) params.set('cursor', opts.cursor);
  const url = `${getHorizonUrl().replace(/\/$/, '')}/payments?${params.toString()}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: opts.signal });
  if (!res.ok) {
    throw new AppError('INTERNAL', `Poll returned ${res.status}`, 502);
  }
  const data = (await res.json()) as { _embedded: { records: HorizonPayment[] } };
  let lastCursor = opts.cursor ?? '';
  for (const p of data._embedded.records) {
    if (p.type !== 'payment') continue;
    if (p.to !== opts.destination) continue;
    if (opts.usdcOnly) {
      if (p.asset_type === 'native') continue;
      if (p.asset_code !== usdcCode() || p.asset_issuer !== usdcIssuer()) continue;
    }
    lastCursor = p.id;
    await opts.onMatch({
      txHash: p.transaction_hash,
      paymentId: p.id,
      from: p.from,
      to: p.to,
      amount: p.amount,
      assetCode: p.asset_code ?? usdcCode(),
      assetIssuer: p.asset_issuer ?? usdcIssuer(),
      createdAt: new Date(p.created_at),
    });
  }
  return lastCursor;
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
