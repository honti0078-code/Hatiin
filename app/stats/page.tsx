'use client';

import {
  CheckCircle,
  Loader2,
  LogIn,
  Receipt,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface Stats {
  uniqueWallets: number;
  totalLogins: number;
  totalBills: number;
  settledBills: number;
  totalParticipants: number;
  paidParticipants: number;
  perDay: Array<{ date: string; users: number; logins: number }>;
  generatedAt: string;
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-amber-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-gray-900 font-[var(--font-heading)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stats', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? 'Failed to load stats');
      setStats(json.data as Stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxDay = stats?.perDay.reduce((m, d) => Math.max(m, d.logins), 0) ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      <nav className="border-b border-amber-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-amber-600">
            <Users className="h-6 w-6" />
            <span className="font-[var(--font-heading)]">Hatiin</span>
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="border-2 border-amber-200 text-amber-600 text-sm font-semibold px-4 h-9 rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 font-[var(--font-heading)]">
            Usage metrics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real wallet users — demo seed data excluded.
          </p>
        </div>

        {error ? (
          <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {stats ? (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Metric
                icon={Wallet}
                label="Unique wallet users"
                value={stats.uniqueWallets}
                hint="distinct wallets signed in"
              />
              <Metric
                icon={LogIn}
                label="Total logins"
                value={stats.totalLogins}
                hint="wallet sign-ins"
              />
              <Metric
                icon={Receipt}
                label="Bills created"
                value={stats.totalBills}
                hint={`${stats.settledBills} settled`}
              />
              <Metric
                icon={Users}
                label="Participants"
                value={stats.totalParticipants}
                hint="across all bills"
              />
              <Metric
                icon={CheckCircle}
                label="Shares paid"
                value={stats.paidParticipants}
                hint="on-chain settlements"
              />
            </div>

            <div className="mt-10">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Daily sign-ins (last 14 days)
              </h2>
              {stats.perDay.length === 0 ? (
                <p className="text-sm text-gray-400">No sign-ins yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.perDay.map((d) => (
                    <div key={d.date} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 font-mono text-xs text-gray-400">{d.date}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-amber-50">
                        <div
                          className="h-full rounded bg-amber-500"
                          style={{ width: `${maxDay ? (d.logins / maxDay) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs text-gray-400">
                        {d.users} users · {d.logins} logins
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-8 text-xs text-gray-400">
              Updated {new Date(stats.generatedAt).toLocaleString()}
            </p>
          </>
        ) : loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        ) : null}
      </main>
    </div>
  );
}
