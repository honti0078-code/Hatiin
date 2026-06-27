'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  ArrowLeft,
  CheckCircle,
  Copy,
  ExternalLink,
  AlertCircle,
  Wallet,
  Loader2,
} from 'lucide-react';
import type { Bill } from '@/server/db/schema/bills';
import type { Participant } from '@/server/db/schema/participants';
import { EnableUsdc } from '@/ui/components/EnableUsdc';
import { useFreighter } from '@/ui/hooks/useFreighter';

type BillWithParticipants = Bill & { participants: Participant[] };

function minorToUsdc(minor: string): string {
  const n = BigInt(minor);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '00'}`;
}

function QRDisplay({ uri }: { uri: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, uri, {
        width: 240,
        margin: 2,
        color: { dark: '#1f2937', light: '#fffbeb' },
      });
    }
  }, [uri]);

  return <canvas ref={canvasRef} className="rounded-xl mx-auto" />;
}

export default function PayPage({
  params,
}: {
  params: Promise<{ id: string; participantId: string }>;
}) {
  const { id: billId, participantId } = use(params);
  const { isAvailable, connect, signAuthEntry, publicKey } = useFreighter();
  const [bill, setBill] = useState<BillWithParticipants | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paidHash, setPaidHash] = useState<string | null>(null);
  const [payAsset, setPayAsset] = useState<'usdc' | 'xlm'>('xlm');
  const [assetTouched, setAssetTouched] = useState(false);
  const [usdcCfg, setUsdcCfg] = useState<{ code: string; issuer: string } | null>(null);

  const pickAsset = (a: 'usdc' | 'xlm') => {
    setAssetTouched(true);
    setPayAsset(a);
  };

  const onPayWithFreighter = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const pk = publicKey ?? (await connect());
      if (!pk) {
        setPaying(false);
        return;
      }
      // 1. Build unsigned payment XDR (participant -> creator)
      const bRes = await fetch(`/api/bills/${billId}/pay/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, asset: payAsset }),
      });
      const bJson = await bRes.json();
      if (!bJson.ok) throw new Error(bJson.error?.message ?? 'Failed to build payment');

      // 2. Sign with Freighter (pinned to app network)
      const signed = await signAuthEntry(bJson.data.xdr);
      if (!signed) throw new Error('Signing was cancelled');

      // 3. Submit to Horizon + record settlement
      const sRes = await fetch(`/api/bills/${billId}/pay/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, signedXdr: signed }),
      });
      const sJson = await sRes.json();
      if (!sJson.ok) throw new Error(sJson.error?.message ?? 'Payment submission failed');
      setPaidHash(sJson.data.txHash as string);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  useEffect(() => {
    fetch(`/api/bills/${billId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setBill(data.data.bill);
          if (data.data.usdc) setUsdcCfg(data.data.usdc);
          // Default the payment method to the bill's chosen settlement asset
          // (until the payer explicitly picks a different one).
          if (!assetTouched) {
            setPayAsset(data.data.bill.asset === 'xlm' ? 'xlm' : 'usdc');
          }
        } else setError('Bill not found');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [billId, assetTouched]);

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

  const participant = bill.participants.find((p) => p.id === participantId);

  if (!participant) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-600">Participant not found</p>
        </div>
      </div>
    );
  }

  if (participant.status === 'paid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 font-[var(--font-heading)] mb-2">
            Already Paid!
          </h1>
          <p className="text-gray-600 mb-2">{participant.displayName} has already paid their share.</p>
          <p className="text-green-700 font-semibold mb-6">
            {minorToUsdc(participant.shareMinor)} {bill.asset === 'xlm' ? 'XLM' : 'USDC'}
          </p>
          <Link
            href={`/bills/${billId}`}
            className="bg-green-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-green-600 transition-colors inline-flex items-center gap-2"
          >
            View Bill
          </Link>
        </div>
      </div>
    );
  }

  if (paidHash) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 font-[var(--font-heading)] mb-2">
            Payment sent!
          </h1>
          <p className="text-gray-600 mb-2">
            {participant.displayName}&apos;s share is settled on Stellar.
          </p>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${paidHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-green-700 font-mono text-xs underline break-all inline-block mb-6"
          >
            {paidHash.slice(0, 12)}…{paidHash.slice(-12)}
          </a>
          <div>
            <Link
              href={`/bills/${billId}`}
              className="bg-green-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-green-600 transition-colors inline-flex items-center gap-2"
            >
              View Bill
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const shareMinor = BigInt(participant.shareMinor);
  const shareWhole = shareMinor / 1_000_000n;
  const shareFrac = shareMinor % 1_000_000n;
  const shareUsdc = `${shareWhole}.${shareFrac.toString().padStart(6, '0').replace(/0+$/, '') || '00'}`;

  const memo = bill.id.replace(/-/g, '').slice(0, 28);
  const assetCode = usdcCfg?.code ?? 'USDC';
  const issuer = usdcCfg?.issuer;
  const assetLabel = payAsset === 'xlm' ? 'XLM' : 'USDC';
  // XLM (native) carries no asset_code/asset_issuer; USDC carries the live issuer
  // identity supplied by the bill API (never hardcoded).
  const uri =
    payAsset === 'xlm' || !issuer
      ? `web+stellar:pay?destination=${bill.creatorPublicKey}&amount=${shareUsdc}&memo=${memo}&memo_type=text`
      : `web+stellar:pay?destination=${bill.creatorPublicKey}&amount=${shareUsdc}&asset_code=${assetCode}&asset_issuer=${issuer}&memo=${memo}&memo_type=text`;

  const copyUri = async () => {
    await navigator.clipboard.writeText(uri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      {/* Navbar */}
      <nav className="border-b border-amber-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href={`/bills/${billId}`} className="text-amber-600 hover:text-amber-800 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 font-bold text-xl text-amber-600">
            <Users className="h-6 w-6" />
            <span className="font-[var(--font-heading)]">Hatiin</span>
          </div>
        </div>
      </nav>

      <main className="max-w-sm mx-auto px-4 py-8 text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 font-[var(--font-heading)] mb-1">
            Pay Your Share
          </h1>
          <p className="text-gray-500 text-sm">{bill.title}</p>
        </div>

        {/* Payment method selector: USDC (bill asset) or XLM (no trustline needed) */}
        <div className="mb-4 inline-flex rounded-xl border border-amber-200 bg-white p-1">
          <button
            type="button"
            onClick={() => pickAsset('xlm')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              payAsset === 'xlm' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-50'
            }`}
          >
            Pay in XLM
          </button>
          <button
            type="button"
            onClick={() => pickAsset('usdc')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              payAsset === 'usdc' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-50'
            }`}
          >
            Pay in USDC
          </button>
        </div>

        <div className="bg-white rounded-2xl border-2 border-amber-200 p-6 mb-6">
          <div className="mb-4">
            <div className="text-sm text-gray-500 mb-1">{participant.displayName}</div>
            <div className="text-4xl font-bold text-amber-600 font-[var(--font-heading)]">
              {shareUsdc} {assetLabel}
            </div>
            {payAsset === 'xlm' && (
              <div className="text-[11px] text-gray-400 mt-1">
                Paying the same share amount in native XLM — no trustline required.
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1 font-mono">
              {participant.publicKey.slice(0, 8)}...{participant.publicKey.slice(-4)}
            </div>
          </div>

          <QRDisplay uri={uri} />
        </div>

        {/* Pay directly with Freighter (real on-chain settle path) */}
        {isAvailable && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onPayWithFreighter}
              disabled={paying}
              className="w-full bg-amber-500 text-white font-semibold py-3 rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 text-base"
            >
              {paying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Paying…
                </>
              ) : (
                <>
                  <Wallet className="h-5 w-5" /> Pay {shareUsdc} {assetLabel} with Freighter
                </>
              )}
            </button>
            {payError && <p className="text-red-500 text-xs mt-2">{payError}</p>}
            <p className="text-xs text-gray-400 mt-2">
              Signs &amp; submits a {assetLabel} payment from your connected wallet on Stellar
              testnet.
            </p>
            {/* If a USDC payment was rejected for lack of a trustline, this lets the
                connected wallet enable USDC on itself in one click. */}
            {payAsset === 'usdc' && payError && /trustline|enabled USDC|op_no_trust/i.test(payError) && (
              <div className="mt-3 text-left">
                <EnableUsdc />
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-gray-500 mb-4">
          Or scan with any Stellar wallet to pay your share directly.
        </p>

        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={copyUri}
            className="flex-1 border-2 border-amber-200 text-amber-600 font-semibold py-3 rounded-lg hover:bg-amber-50 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied!' : 'Copy URI'}
          </button>
          <a
            href={uri}
            className="flex-1 bg-amber-500 text-white font-semibold py-3 rounded-lg hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <ExternalLink className="h-4 w-4" />
            Open Wallet
          </a>
        </div>

        <div className="text-xs text-gray-400">
          To:{' '}
          <span className="font-mono">
            {bill.creatorPublicKey.slice(0, 8)}...{bill.creatorPublicKey.slice(-4)}
          </span>
          <br />
          Memo: {memo}
        </div>
      </main>
    </div>
  );
}
