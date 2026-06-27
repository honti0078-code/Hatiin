import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { sessions } from '@/server/db/schema';
import { readSessionCookie } from '@/server/lib/cookies';
import type { Middleware } from './compose';

/**
 * Optional authentication. If a valid, non-expired session cookie is present it
 * populates `ctx.publicKey` (used for ownership / "My Bills"). If there is no
 * session — or it is invalid/expired — the request still proceeds with
 * `ctx.publicKey` left undefined. Never throws 401.
 *
 * Use this on endpoints that must work both for connected wallets and for
 * anonymous visitors (e.g. creating a bill with a typed receiving address).
 */
export const withOptionalAuth: Middleware = (handler) => async (req, ctx) => {
  const sessionId = readSessionCookie(req);
  if (sessionId) {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (row && row.expiresAt.getTime() >= Date.now()) {
      ctx.publicKey = row.publicKey;
    }
  }
  return handler(req, ctx);
};
