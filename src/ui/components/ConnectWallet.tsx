'use client';

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFreighter } from '@/ui/hooks/useFreighter';
import { useSession } from '@/ui/hooks/useSession';

function truncate(pk: string, head = 4, tail = 4): string {
  if (pk.length <= head + tail) return pk;
  return `${pk.slice(0, head)}…${pk.slice(-tail)}`;
}

const NETWORK =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'public' ? 'public' : 'testnet';

function explorerUrl(pk: string): string {
  const net = NETWORK === 'public' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/account/${pk}`;
}

/**
 * Wallet connect chip. Drives the SEP-10 challenge/verify flow:
 *   requestAccess -> POST /api/auth/challenge -> sign tx (pinned to TESTNET)
 *   -> POST /api/auth/verify -> session cookie set.
 * Restores an existing session via GET /api/auth/me (useSession).
 */
export function ConnectWallet() {
  const {
    isAvailable,
    isConnected,
    loading: freighterLoading,
    connect,
    signAuthEntry,
    disconnect: disconnectFreighter,
  } = useFreighter();
  const { session, refresh, logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const pk = await connect();
      if (!pk) {
        setBusy(false);
        return;
      }
      // 1. Challenge
      const chRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publicKey: pk }),
      });
      const chJson = await chRes.json();
      if (!chJson.ok) throw new Error(chJson.error?.message ?? 'Challenge failed');
      const txXdr: string = chJson.data.txXdr;

      // 2. Sign (pinned to app network inside the hook)
      const signed = await signAuthEntry(txXdr);
      if (!signed) throw new Error('No signed challenge returned');

      // 3. Verify -> sets stellar_session cookie
      const vRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publicKey: pk, signedNonce: signed }),
      });
      const vJson = await vRes.json();
      if (!vJson.ok) throw new Error(vJson.error?.message ?? 'Verification failed');

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      disconnectFreighter();
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setOpen(false);
    await logout();
    disconnectFreighter();
  };

  const onCopy = async () => {
    if (!session.publicKey) return;
    try {
      await navigator.clipboard.writeText(session.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (freighterLoading) {
    return <div className="h-9 w-32 rounded-lg bg-amber-100 animate-pulse" />;
  }

  if (!isAvailable) {
    return (
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noreferrer"
        className="border-2 border-amber-500 text-amber-600 text-sm font-semibold px-4 h-9 rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-2"
      >
        <Wallet className="h-4 w-4" />
        Install Freighter
      </a>
    );
  }

  if (!isConnected || !session.publicKey) {
    return (
      <div className="flex flex-col items-end">
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          title="Optional — you can create and pay bills without connecting a wallet"
          className="border-2 border-amber-500 text-amber-600 text-sm font-semibold px-4 h-9 rounded-lg hover:bg-amber-50 disabled:opacity-60 transition-colors flex items-center gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
            </>
          ) : (
            <>
              <Wallet className="h-4 w-4" /> Connect Wallet
            </>
          )}
        </button>
        <span className="text-[10px] text-amber-500/70 mt-0.5 pr-1">optional</span>
        {error && <span className="text-xs text-red-500 mt-1 max-w-[220px] text-right">{error}</span>}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border-2 border-amber-200 bg-white text-amber-700 text-sm font-semibold px-3 h-9 rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-2 font-mono"
      >
        <Wallet className="h-4 w-4" />
        {truncate(session.publicKey)}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-amber-100 shadow-lg p-2 z-50">
          <div className="px-2 py-2 border-b border-amber-50">
            <p className="text-xs text-gray-400">Freighter · {NETWORK}</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-700">{session.publicKey}</p>
          </div>
          <button
            type="button"
            onClick={onCopy}
            className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 hover:bg-amber-50 rounded-lg transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy address'}
          </button>
          <a
            href={explorerUrl(session.publicKey)}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-700 hover:bg-amber-50 rounded-lg transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            View on explorer
          </a>
          <button
            type="button"
            onClick={onDisconnect}
            className="w-full flex items-center gap-2 px-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
