import { fromError } from '@/server/lib/http';
import type { Middleware } from './compose';

export const withError: Middleware = (handler) => async (req, ctx) => {
  try {
    return await handler(req, ctx);
  } catch (err) {
    return fromError(err);
  }
};
