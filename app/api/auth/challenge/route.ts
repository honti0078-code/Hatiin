export const dynamic = 'force-dynamic';

import { requestChallenge } from '@/server/controller/auth.controller';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';

export const POST = compose(withError, withRateLimit)(requestChallenge);
