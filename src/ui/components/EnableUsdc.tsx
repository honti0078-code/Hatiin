'use client';

import { CheckCircle, Coins, ExternalLink, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useFreighter } from '@/ui/hooks/useFreighter';

type Status = 'idle' | 'working' | 'done' | 'error';

/**
 * One-click "Enable USDC" helper. Signs a `changeTrust` transaction with the
 * connected Freighter wallet so the account can receive USDC — this is what
 * fixes the `op_no_trust` payment rejection for bill creators.
 *
 * Wallet connection is still optional for the rest of the app; this helper just
 * needs Freighter to sign the trustline for the user's own account.
 */
export function EnableUsdc() {
  const { isAvailable, publicKey, connect, signAuthEntry } = useFreighter();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const onEnable = async () => {
    setStatus('working');
    setMessage(null);
    setTxHash(null);
    try {
      const pk = publicKey ?? (await connect());
      if (!pk) {
        setStatus('idle');
        return;
      }

      const bRes = await fetch('/api/stellar/trustline/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pk }),
      });
      const bJson = await bRes.json();
      if (!bJson.ok) {
        // "Already enabled" is a friendly success, not a failure.
        if (/already enabled/i.test(bJson.error?.message ?? '')) {
          setStatus('done');
          setMessage('USDC is already enabled on your wallet — you can receive USDC.');
          return;
        }
        throw new Error(bJson.error?.message ?? 'Could not build the trustline transaction');
      }

      const signed = await signAuthEntry(bJson.data.xdr);
      if (!signed) throw new Error('Signing was cancelled');

      const sRes = await fetch('/api/stellar/trustline/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed }),
      });
      const sJson = await sRes.json();
      if (!sJson.ok) throw new Error(sJson.error?.message ?? 'Could not enable USDC');

      setTxHash(sJson.data.txHash as string);
      setStatus('done');
      setMessage('USDC enabled! Your wallet can now receive USDC payments.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to enable USDC');
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <Coins className="h-5 w-5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 font-[var(--font-heading)] text-sm">
            Enable USDC on your wallet
          </h3>
          <p className="text-xs text-gray-600 mt-0.5">
            To receive USDC your Stellar account needs a USDC trustline. Add it in one click with
            Freighter (costs a tiny ~0.5 XLM reserve, refundable).
          </p>

          {status === 'done' ? (
            <div className="mt-3 flex flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
                <CheckCircle className="h-4 w-4" /> {message}
              </span>
              {txHash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-amber-600 underline"
                >
                  {txHash.slice(0, 10)}…{txHash.slice(-8)} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : (
            <div className="mt-3">
              {!isAvailable ? (
                <a
                  href="https://www.freighter.app/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-500 px-3 py-2 text-xs font-semibold text-amber-600 hover:bg-amber-50"
                >
                  Install Freighter to enable USDC
                </a>
              ) : (
                <button
                  type="button"
                  onClick={onEnable}
                  disabled={status === 'working'}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                >
                  {status === 'working' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Enabling…
                    </>
                  ) : (
                    <>
                      <Coins className="h-4 w-4" /> Enable USDC
                    </>
                  )}
                </button>
              )}
              {status === 'error' && message && (
                <p className="mt-2 text-xs text-red-500">{message}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
