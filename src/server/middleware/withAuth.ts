import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { sessions } from '@/server/db/schema';
import { readSessionCookie } from '@/server/lib/cookies';
import { AppError } from '@/server/lib/http';
import type { Middleware } from './compose';

export const withAuth: Middleware = (handler) => async (req, ctx) => {
  const sessionId = readSessionCookie(req);
  if (!sessionId) {
    throw new AppError('UNAUTHORIZED', 'Missing session', 401);
  }
  const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!row) {
    throw new AppError('UNAUTHORIZED', 'Invalid session', 401);
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new AppError('UNAUTHORIZED', 'Session expired', 401);
  }
  ctx.publicKey = row.publicKey;
  return handler(req, ctx);
};
