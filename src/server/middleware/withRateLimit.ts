import { AppError } from '@/server/lib/http';
import type { Middleware } from './compose';

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();
const CAPACITY = 10;
const REFILL_PER_SEC = 1;

function take(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, lastRefill: now };
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_SEC);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

export const withRateLimit: Middleware = (handler) => async (req, ctx) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  if (!take(ip)) {
    throw new AppError('RATE_LIMITED', 'Too many requests', 429);
  }
  return handler(req, ctx);
};
