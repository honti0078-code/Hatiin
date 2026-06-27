'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Plus,
  Users,
  SplitSquareVertical,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import type { Bill } from '@/server/db/schema/bills';
import { ConnectWallet } from '@/ui/components/ConnectWallet';
import { useSession } from '@/ui/hooks/useSession';

function minorToUsdc(minor: string): string {
  const n = BigInt(minor);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '00'}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'settled') {
    return (
      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
        <CheckCircle className="h-3 w-3" />
        SETTLED
      </span>
    );
  }
  if (status === 'settling') {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
        <Clock className="h-3 w-3" />
        SETTLING
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
      <AlertCircle className="h-3 w-3" />
      OPEN
    </span>
  );
}

function BillCard({ bill }: { bill: Bill }) {
  const totalUsdc = minorToUsdc(bill.totalAmountMinor);
  const paidUsdc = minorToUsdc(bill.paidAmountMinor);
  const total = BigInt(bill.totalAmountMinor);
  const paid = BigInt(bill.paidAmountMinor);
  const pct = total > 0n ? Number((paid * 100n) / total) : 0;
  const assetLabel = bill.asset === 'xlm' ? 'XLM' : 'USDC';

  return (
    <Link href={`/bills/${bill.id}`} className="block">
      <div className="bg-white rounded-xl border border-amber-100 p-5 hover:border-amber-300 hover:shadow-md transition-all group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 mr-2">
            <h3 className="font-semibold text-gray-900 font-[var(--font-heading)] truncate group-hover:text-amber-700 transition-colors">
              {bill.title}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {bill.participantCount} participants
            </p>
          </div>
          <StatusBadge status={bill.status} />
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-gray-500">
              {paidUsdc} / {totalUsdc} {assetLabel}
            </span>
            <span className="text-gray-700 font-medium">{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{new Date(bill.createdAt).toLocaleDateString('vi-VN')}</span>
          <ArrowRight className="h-3.5 w-3.5 text-amber-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { session, loading: sessionLoading } = useSession();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connected = !!session.publicKey;

  useEffect(() => {
    if (sessionLoading) return;
    if (!connected) {
      setBills([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch('/api/bills', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setBills(data.data.bills);
        else setError(data.error?.message ?? 'Failed to load bills');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [connected, sessionLoading, session.publicKey]);

  const openBills = bills.filter((b) => b.status === 'open' || b.status === 'settling');
  const settledBills = bills.filter((b) => b.status === 'settled');

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      {/* Navbar */}
      <nav className="border-b border-amber-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-amber-600">
            <Users className="h-6 w-6" />
            <span className="font-[var(--font-heading)]">Hatiin</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/create"
              className="bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Bill
            </Link>
            <ConnectWallet />
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 font-[var(--font-heading)]">My Bills</h1>
          <p className="text-gray-600 mt-1">
            {connected
              ? 'Bills you created. Settle each share in XLM or USDC on Stellar.'
              : 'Create a bill now — no wallet needed. Connect a wallet (optional) to sync bills you created here.'}
          </p>
        </div>

        {/* Not connected — optional connect, never a wall */}
        {!sessionLoading && !connected && (
          <div className="text-center py-20 border-2 border-dashed border-amber-200 rounded-2xl bg-white">
            <SplitSquareVertical className="h-12 w-12 text-amber-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 font-[var(--font-heading)] mb-2">
              Start a bill — no wallet required
            </h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Just type the Stellar address where you want to get paid. Connecting a wallet is
              optional and only used to sync the bills you create across sessions.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link
                href="/dashboard/create"
                className="bg-amber-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-600 transition-colors inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create a Bill
              </Link>
              <ConnectWallet />
            </div>
          </div>
        )}

        {connected && loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4" />
            Loading bills...
          </div>
        )}

        {connected && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
            {error}
          </div>
        )}

        {connected && !loading && !error && bills.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-amber-200 rounded-2xl bg-white">
            <SplitSquareVertical className="h-12 w-12 text-amber-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 font-[var(--font-heading)] mb-2">
              No bills yet
            </h3>
            <p className="text-gray-500 mb-6">
              Create your first bill to start splitting costs with friends.
            </p>
            <Link
              href="/dashboard/create"
              className="bg-amber-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-600 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create first bill
            </Link>
          </div>
        )}

        {connected && !loading && bills.length > 0 && (
          <>
            {/* Active bills */}
            {openBills.length > 0 && (
              <div className="mb-10">
                <h2 className="text-lg font-semibold text-gray-700 mb-4 font-[var(--font-heading)]">
                  Active Bills ({openBills.length})
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {openBills.map((bill) => (
                    <BillCard key={bill.id} bill={bill} />
                  ))}
                </div>
              </div>
            )}

            {/* Settled bills */}
            {settledBills.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-700 mb-4 font-[var(--font-heading)]">
                  Settled Bills ({settledBills.length})
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {settledBills.map((bill) => (
                    <BillCard key={bill.id} bill={bill} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
