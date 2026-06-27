'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

type Session = { publicKey: string | null };

type Snapshot = {
  session: Session;
  loading: boolean;
};

// Module-level singleton: one source of truth shared by every component that
// calls useSession(). All consumers re-render on change via useSyncExternalStore.
let state: Snapshot = {
  session: { publicKey: null },
  loading: true,
};
const listeners = new Set<() => void>();
let inFlightRefresh: Promise<void> | null = null;

function emit() {
  for (const l of listeners) l();
}

function setState(next: Snapshot) {
  state = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

const SSR_SNAPSHOT: Snapshot = Object.freeze({
  session: Object.freeze({ publicKey: null }) as Session,
  loading: true,
}) as Snapshot;
function getServerSnapshot() {
  return SSR_SNAPSHOT;
}

async function fetchAndStoreSession(): Promise<void> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    const json = await res.json();
    const publicKey = json?.ok ? (json.data?.publicKey ?? null) : null;
    setState({ session: { publicKey }, loading: false });
  } catch {
    setState({ session: { publicKey: null }, loading: false });
  } finally {
    inFlightRefresh = null;
  }
}

export function useSession() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const refresh = useCallback(async () => {
    if (inFlightRefresh) return inFlightRefresh;
    inFlightRefresh = fetchAndStoreSession();
    return inFlightRefresh;
  }, []);

  useEffect(() => {
    if (state.loading) void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setState({ session: { publicKey: null }, loading: false });
    }
  }, []);

  return { session: snap.session, loading: snap.loading, refresh, logout };
}
