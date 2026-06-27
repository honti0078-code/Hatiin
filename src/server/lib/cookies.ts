import type { NextRequest } from 'next/server';
import { env } from '@/server/config/env';

export function setSessionCookie(res: Response, sessionId: string): void {
  const maxAge = env.SESSION_TTL_SECONDS;
  const isProd = env.NODE_ENV === 'production';
  const value = `${env.SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isProd ? '; Secure' : ''}`;
  res.headers.append('Set-Cookie', value);
}

export function clearSessionCookie(res: Response): void {
  const isProd = env.NODE_ENV === 'production';
  const value = `${env.SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`;
  res.headers.append('Set-Cookie', value);
}

export function readSessionCookie(req: NextRequest): string | null {
  const raw = req.cookies.get(env.SESSION_COOKIE_NAME)?.value;
  return raw ?? null;
}
