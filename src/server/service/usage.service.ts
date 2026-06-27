import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

/**
 * Reserved denylist of non-real public keys to exclude from every count, so the
 * numbers reflect real wallet users only. The app ships with no seed data; this
 * is a safety net and is intentionally generic (no fabricated personas).
 */
const DEMO_KEYS = [
  'GDEMOEXCLUDE00000000000000000000000000000000000000000001',
];

export interface UsageStats {
  uniqueWallets: number;
  totalLogins: number;
  totalBills: number;
  settledBills: number;
  totalParticipants: number;
  paidParticipants: number;
  perDay: Array<{ date: string; users: number; logins: number }>;
  generatedAt: string;
}

async function rows(query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  const res = (await db.execute(query)) as unknown as { rows: Record<string, unknown>[] };
  return res.rows ?? [];
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

export async function getUsageStats(): Promise<UsageStats> {
  const demo = sql.raw(`('${DEMO_KEYS.join("','")}')`);

  const [wallets] = await rows(
    sql`select count(distinct public_key)::int c from sessions where public_key not in ${demo}`,
  );
  const [logins] = await rows(
    sql`select count(*)::int c from sessions where public_key not in ${demo}`,
  );
  const [billsTotal] = await rows(
    sql`select count(*)::int c from bills where creator_public_key not in ${demo}`,
  );
  const [billsSettled] = await rows(
    sql`select count(*)::int c from bills where creator_public_key not in ${demo} and status = 'settled'`,
  );
  const [partsTotal] = await rows(
    sql`select count(*)::int c from participants p
        join bills b on b.id = p.bill_id
        where b.creator_public_key not in ${demo}`,
  );
  const [partsPaid] = await rows(
    sql`select count(*)::int c from participants p
        join bills b on b.id = p.bill_id
        where b.creator_public_key not in ${demo} and p.status = 'paid'`,
  );
  const perDay = await rows(
    sql`select to_char(created_at,'YYYY-MM-DD') date, count(distinct public_key)::int users, count(*)::int logins
        from sessions where public_key not in ${demo}
        group by 1 order by 1 desc limit 14`,
  );

  return {
    uniqueWallets: num(wallets?.c),
    totalLogins: num(logins?.c),
    totalBills: num(billsTotal?.c),
    settledBills: num(billsSettled?.c),
    totalParticipants: num(partsTotal?.c),
    paidParticipants: num(partsPaid?.c),
    perDay: perDay.map((r) => ({
      date: String(r.date),
      users: num(r.users),
      logins: num(r.logins),
    })),
    generatedAt: new Date().toISOString(),
  };
}
