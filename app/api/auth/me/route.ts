export const dynamic = 'force-dynamic';

import { me } from '@/server/controller/auth.controller';
import { compose } from '@/server/middleware/compose';
import { withAuth } from '@/server/middleware/withAuth';
import { withError } from '@/server/middleware/withError';

export const GET = compose(withError, withAuth)(me);
