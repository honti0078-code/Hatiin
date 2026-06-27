import { env } from '@/server/config/env';
import { AppError } from '@/server/lib/http';
import type { Middleware } from './compose';

/**
 * Per-IP concurrent SSE stream limiter. Unlike `withRateLimit` which throttles
 * request rate, this middleware caps the *number* of simultaneous long-lived
 * streams a single client can open, to prevent connection-exhaustion abuse.
 *
 * The counter increments when the handler returns a response, and decrements
 * when the response body aborts (the `cancel()` callback on a `ReadableStream`).
 * Since route handlers using `createSseResponse` register the cleanup in their
 * start() block, this works for both API routes and direct service callers.
 */
const activeByIp = new Map<string, number>();

export const withRateLimitSse: Middleware = (handler) => async (req, ctx) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  const active = activeByIp.get(ip) ?? 0;
  if (active >= env.SSE_MAX_CONCURRENT_PER_IP) {
    throw new AppError('RATE_LIMITED', 'Too many concurrent streams', 429);
  }
  activeByIp.set(ip, active + 1);
  try {
    const res = await handler(req, ctx);
    if (res.body instanceof ReadableStream) {
      const decrement = () => {
        const v = activeByIp.get(ip) ?? 1;
        activeByIp.set(ip, Math.max(0, v - 1));
      };
      // Hook the cancel path so the counter frees when the client disconnects.
      const originalCancel = res.body.cancel.bind(res.body);
      res.body.cancel = (reason) => {
        decrement();
        return originalCancel(reason);
      };
    } else {
      activeByIp.set(ip, Math.max(0, (activeByIp.get(ip) ?? 1) - 1));
    }
    return res;
  } catch (err) {
    activeByIp.set(ip, Math.max(0, (activeByIp.get(ip) ?? 1) - 1));
    throw err;
  }
};

export function resetRateLimitSseState(): void {
  activeByIp.clear();
}
