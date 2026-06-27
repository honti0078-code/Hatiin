import { env } from '@/server/config/env';
import { AppError } from '@/server/lib/http';
import type { Middleware } from './compose';

/**
 * 404s the request unless the server is running in demo mode. Use on
 * `simulate-*` endpoints so they vanish from the route surface entirely in
 * non-demo production deploys. The check is `NODE_ENV === 'production' && !env.DEMO_MODE`
 * — i.e. demo routes are always available in dev, and explicitly opt-in in prod.
 */
export const withDemoMode: Middleware = (handler) => async (req, ctx) => {
  if (env.NODE_ENV === 'production' && !env.DEMO_MODE) {
    throw new AppError('NOT_FOUND', 'Not found', 404);
  }
  return handler(req, ctx);
};
