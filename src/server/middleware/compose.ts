import type { NextRequest } from 'next/server';

export type RouteHandler = (req: NextRequest, ctx: HandlerContext) => Promise<Response> | Response;

export type HandlerContext = {
  /** Next.js route params (required for Next.js 16 route handler type compatibility). */
  params?: Promise<Record<string, string | string[] | undefined>>;
  /** Set by `withAuth` — the merchant's Stellar public key. */
  publicKey?: string;
  /** Set by `withCustomerAuth` — the verified customer JWT (opaque, kept for logs). */
  customerToken?: string;
  /** Set by `withCustomerAuth` — the customer's Stellar public key (from JWT `sub`). */
  customerAccount?: string;
  [k: string]: unknown;
};

export type Middleware = (handler: RouteHandler) => RouteHandler;

// Returns a Next.js-compatible handler using 'any' cast for ctx to avoid 
// strict type mismatch with Next.js 16's AppRouteHandlerFnContext validation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compose(...middlewares: Middleware[]) {
  return (handler: RouteHandler): ((req: NextRequest, ctx: any) => Promise<Response> | Response) => {
    const composed = middlewares.reduceRight((acc, mw) => mw(acc), handler);
    return (req: NextRequest, ctx: any) => composed(req, ctx as HandlerContext);
  };
}
