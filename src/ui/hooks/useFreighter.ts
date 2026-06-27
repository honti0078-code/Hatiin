'use client';

import {
  getAddress as freighterGetAddress,
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';
import { useCallback, useEffect, useState } from 'react';

type State = {
  publicKey: string | null;
  isAvailable: boolean;
  isConnected: boolean;
  loading: boolean;
  error: string | null;
};

const INITIAL: State = {
  publicKey: null,
  isAvailable: false,
  isConnected: false,
  loading: true,
  error: null,
};

/**
 * Race a Freighter API call against a timeout. `isConnected()` resolves with
 * `{ isConnected: false }` for users without the extension, but the
 * message-passing layer can still hang in edge cases. The timeout forces the
 * hook to settle so the UI degrades to the "Install Freighter" branch instead
 * of a permanent skeleton.
 */
/**
 * Coerce a Freighter error (which may be a string OR an object like
 * `{ message }` / `{ code }`) into a readable string. Using `String(err)` on an
 * object yields the useless "[object Object]" — this extracts a real message.
 */
function freighterErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
    try {
      return JSON.stringify(err);
    } catch {
      /* fall through */
    }
  }
  return 'Freighter request failed';
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Freighter ${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

const AVAILABILITY_TIMEOUT_MS = 2_000;
// requestAccess / signTransaction open the Freighter popup and resolve only
// once the user interacts — human-paced, so they must NOT share the short
// availability timeout.
const CONNECT_TIMEOUT_MS = 120_000;
const SIGN_TIMEOUT_MS = 90_000;

export function useFreighter() {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { isConnected: connected } = await withTimeout(
          freighterIsConnected(),
          AVAILABILITY_TIMEOUT_MS,
          'isConnected',
        );
        if (cancelled) return;

        if (!connected) {
          setState({ ...INITIAL, loading: false });
          return;
        }

        try {
          const { address } = await withTimeout(
            freighterGetAddress(),
            AVAILABILITY_TIMEOUT_MS,
            'getAddress',
          );
          if (cancelled) return;
          setState({
            publicKey: address,
            isAvailable: true,
            isConnected: true,
            loading: false,
            error: null,
          });
        } catch {
          if (cancelled) return;
          setState({ ...INITIAL, isAvailable: true, loading: false });
        }
      } catch {
        if (cancelled) return;
        setState({ ...INITIAL, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      const result = await withTimeout(
        freighterRequestAccess(),
        CONNECT_TIMEOUT_MS,
        'requestAccess',
      );
      // Freighter v6 returns `{ address, error }`. On success some builds still
      // send a benign/empty `error` (e.g. `{}` or '') alongside a valid address.
      // Treat ANY returned address as success — only fail when there is no
      // address at all (true rejection / unavailable).
      const address = (result as { address?: string }).address;
      if (!address) {
        const errVal = (result as { error?: unknown }).error;
        throw new Error(errVal ? freighterErrorMessage(errVal) : 'Freighter returned no address');
      }
      setState({
        publicKey: address,
        isAvailable: true,
        isConnected: true,
        loading: false,
        error: null,
      });
      return address;
    } catch (err) {
      setState((s) => ({ ...s, error: freighterErrorMessage(err) }));
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((s) => ({ ...s, isConnected: false, publicKey: null }));
  }, []);

  const signAuthEntry = useCallback(
    async (entryXdr: string) => {
      const pk = state.publicKey;
      if (!pk) throw new Error('Wallet not connected');
      // Pin the signing passphrase to the app's own network, NOT the user's
      // Freighter network. If the wallet is on Mainnet, signing with the Public
      // passphrase makes the SEP-10 verify (built with TESTNET) fail 401.
      const networkPassphrase =
        process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'public'
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015';
      const result = await withTimeout(
        freighterSignTransaction(entryXdr, { address: pk, networkPassphrase }),
        SIGN_TIMEOUT_MS,
        'signTransaction',
      );
      // Same tolerance as connect(): a returned signedTxXdr means success even
      // if a benign empty `error` is also present.
      const signed = (result as { signedTxXdr?: string }).signedTxXdr;
      if (!signed) {
        const errVal = (result as { error?: unknown }).error;
        throw new Error(errVal ? freighterErrorMessage(errVal) : 'No signed transaction returned');
      }
      return signed;
    },
    [state.publicKey],
  );

  return { ...state, connect, disconnect, signAuthEntry };
}
