'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  CheckCircle,
  Clock,
  ArrowLeft,
  QrCode,
  Copy,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

const SPLIT_CONTRACT_ID = process.env.NEXT_PUBLIC_SPLIT_CONTRACT_ID;
import type { Bill } from '@/server/db/schema/bills';
import type { Participant } from '@/server/db/schema/participants';

type BillWithParticipants = Bill & { participants: Participant[] };

function minorToUsdc(minor: string): string {
  const n = BigInt(minor);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '00'}`;
}

function ParticipantPill({
  participant,
  billId,
  assetLabel,
}: {
  participant: Participant;
  billId: string;
  assetLabel: string;
}) {
  if (participant.status === 'paid') {
    return (
      <div className="flex items-center justify-between py-3 px-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <div className="font-medium text-gray-900 text-sm">{participant.displayName}</div>
            <div className="text-xs text-gray-500 font-mono">{participant.publicKey.slice(0, 8)}...{participant.publicKey.slice(-4)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-green-700">{minorToUsdc(participant.shareMinor)} {assetLabel}</div>
          <div className="text-xs text-green-600">Paid</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
        <div>
          <div className="font-medium text-gray-900 text-sm">{participant.displayName}</div>
          <div className="text-xs text-gray-500 font-mono">{participant.publicKey.slice(0, 8)}...{participant.publicKey.slice(-4)}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-amber-700">{minorToUsdc(participant.shareMinor)} {assetLabel}</div>
        <Link
          href={`/pay/${billId}/${participant.id}`}
          className="text-xs text-amber-600 hover:text-amber-800 underline flex items-center gap-1 justify-end"
        >
          Pay now <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function QRDisplay({ uri }: { uri: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, uri, {
        width: 200,
        margin: 2,
        color: { dark: '#1f2937', light: '#fffbeb' },
      });
    }
  }, [uri]);

  return <canvas ref={canvasRef} className="rounded-lg" />;
}

export default function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [bill, setBill] = useState<BillWithParticipants | null>(null);
  const [usdcCfg, setUsdcCfg] = useState<{ code: string; issuer: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justSettled, setJustSettled] = useState(false);
  const [copiedUri, setCopiedUri] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/bills/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setBill(data.data.bill);
          if (data.data.usdc) setUsdcCfg(data.data.usdc);
        } else setError('Bill not found');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [id]);

  // SSE live updates
  useEffect(() => {
    const es = new EventSource(`/api/bills/${id}/stream`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.type === 'participant.paid') {
          setBill((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === event.participantId
                  ? { ...p, status: 'paid' as const, txHash: event.txHash, paidAt: event.paidAt }
                  : p,
              ),
            };
          });
        }

        if (event.type === 'bill.updated') {
          setBill((prev) => {
            if (!prev) return prev;
            const updated = { ...prev, status: event.status as Bill['status'], paidAmountMinor: event.paidAmountMinor };
            if (event.status === 'settled') {
              setJustSettled(true);
              setTimeout(() => setJustSettled(false), 8000);
            }
            return updated;
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => es.close();
  }, [id]);

  const copyUri = async (uri: string) => {
    await navigator.clipboard.writeText(uri);
    setCopiedUri(uri);
    setTimeout(() => setCopiedUri(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-600">{error ?? 'Bill not found'}</p>
          <Link href="/dashboard" className="text-amber-600 mt-4 inline-block hover:underline">
            Back to bills
          </Link>
        </div>
      </div>
    );
  }

  const total = BigInt(bill.totalAmountMinor);
  const paid = BigInt(bill.paidAmountMinor);
  const pct = total > 0n ? Number((paid * 100n) / total) : 0;
  const pendingParticipants = bill.participants.filter((p) => p.status === 'pending');
  const assetLabel = bill.asset === 'xlm' ? 'XLM' : 'USDC';

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 overflow-x-hidden">
      {/* Settled banner */}
      {(bill.status === 'settled' || justSettled) && (
        <div className="bg-green-500 text-white text-center py-3 font-semibold font-[var(--font-heading)] text-lg animate-pulse">
          SETTLED — Everyone paid their share!
        </div>
      )}

      {/* Navbar */}
      <nav className="border-b border-amber-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-amber-600 hover:text-amber-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 font-bold text-xl text-amber-600">
            <Users className="h-6 w-6" />
            <span className="font-[var(--font-heading)]">Hatiin</span>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Bill header */}
        <div className="bg-white rounded-xl border border-amber-100 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 font-[var(--font-heading)]">
                {bill.title}
              </h1>
              {bill.description && (
                <p className="text-gray-500 text-sm mt-1">{bill.description}</p>
              )}
            </div>
            {bill.status === 'settled' ? (
              <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                SETTLED
              </span>
            ) : bill.status === 'settling' ? (
              <span className="bg-amber-100 text-amber-700 text-sm font-semibold px-3 py-1.5 rounded-full flex items-center gap-1">
                <Clock className="h-4 w-4" />
                SETTLING
              </span>
            ) : (
              <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                OPEN
              </span>
            )}
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">
                {minorToUsdc(bill.paidAmountMinor)} / {minorToUsdc(bill.totalAmountMinor)} {assetLabel}
              </span>
              <span className="font-semibold text-gray-700">{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-400">
            {bill.participantCount} participants · Created {new Date(bill.createdAt).toLocaleDateString('en-GB')}
          </div>

          {/* On-chain escrow: XLM bills are funded into the SplitEscrow Soroban
              contract, which releases the pot to the creator once fully funded. */}
          {bill.contractBillId && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-emerald-800">
                  Secured by an on-chain escrow.
                </span>{' '}
                <span className="text-emerald-700">
                  Shares are funded into a Soroban smart contract that releases the
                  total to the organizer only when the bill is fully paid.
                </span>
                {SPLIT_CONTRACT_ID && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/contract/${SPLIT_CONTRACT_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 font-medium text-emerald-700 underline hover:text-emerald-900"
                  >
                    View contract <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="bg-white rounded-xl border border-amber-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 font-[var(--font-heading)] mb-4">
            Participants
          </h2>
          <div className="space-y-3">
            {bill.participants.map((p) => (
              <ParticipantPill key={p.id} participant={p} billId={bill.id} assetLabel={assetLabel} />
            ))}
          </div>
        </div>

        {/* Payment QR codes for pending */}
        {pendingParticipants.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-100 p-6">
            <h2 className="font-semibold text-gray-900 font-[var(--font-heading)] mb-4 flex items-center gap-2">
              <QrCode className="h-5 w-5 text-amber-500" />
              Payment QR Codes
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Share these QR codes with pending participants.
            </p>
            <div className="space-y-4">
              {pendingParticipants.map((p) => {
                const shareMinor = BigInt(p.shareMinor);
                const shareWhole = shareMinor / 1_000_000n;
                const shareFrac = shareMinor % 1_000_000n;
                const shareUsdc = `${shareWhole}.${shareFrac.toString().padStart(6, '0').replace(/0+$/, '') || '00'}`;

                // Build a SEP-7 URI. XLM (native) carries no asset_code/issuer;
                // USDC uses the live issuer from the bill API (never hardcoded).
                const memo = bill.id.replace(/-/g, '').slice(0, 28);
                const issuer = usdcCfg?.issuer;
                const code = usdcCfg?.code ?? 'USDC';
                const uri =
                  bill.asset === 'xlm' || !issuer
                    ? `web+stellar:pay?destination=${bill.creatorPublicKey}&amount=${shareUsdc}&memo=${memo}&memo_type=text`
                    : `web+stellar:pay?destination=${bill.creatorPublicKey}&amount=${shareUsdc}&asset_code=${code}&asset_issuer=${issuer}&memo=${memo}&memo_type=text`;

                return (
                  <div key={p.id} className="border border-amber-100 rounded-lg p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{p.displayName}</div>
                          <div className="text-lg font-bold text-amber-600">{shareUsdc} {assetLabel}</div>
                        </div>
                        <div className="flex gap-2">
                          <Link
                            href={`/pay/${bill.id}/${p.id}`}
                            className="bg-amber-500 text-white text-xs font-semibold py-2 px-3 rounded-lg hover:bg-amber-600 transition-colors"
                          >
                            Pay page
                          </Link>
                          <button
                            type="button"
                            onClick={() => copyUri(uri)}
                            className="flex items-center gap-1 border border-amber-200 text-amber-600 text-xs font-medium py-2 px-3 rounded-lg hover:bg-amber-50 transition-colors"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedUri === uri ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-center">
                        <QRDisplay uri={uri} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
