export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok } from '@/server/lib/http';
import { compose } from '@/server/middleware/compose';
import { z } from 'zod';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { getUsageStats } from '@/server/service/usage.service';

const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
});

// Public read-only usage metrics (real wallet users, bills, participants).
export const GET = compose(withError, withRateLimit)(async (req: NextRequest) => {
  const { days } = statsQuerySchema.parse({
    days: req.nextUrl.searchParams.get('days') ?? undefined,
  });
  return ok(await getUsageStats(days));
});
