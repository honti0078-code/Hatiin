export const dynamic = 'force-dynamic';

import { ok } from '@/server/lib/http';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';

const handler = () => ok({ ok: true, ts: Date.now() });

export const GET = compose(withError)(handler);
