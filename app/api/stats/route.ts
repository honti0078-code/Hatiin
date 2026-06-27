export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { ok } from '@/server/lib/http';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { getUsageStats } from '@/server/service/usage.service';

// Public read-only usage metrics (real wallet users, bills, participants).
export const GET = compose(withError)(async (_req: NextRequest) => ok(await getUsageStats()));
