/**
 * Regression tests for the Freighter connect flow. The real failure these guard
 * against: Freighter v6 can return `{ address, error }` where `error` is a
 * benign empty object on SUCCESS. The hook must NOT fail in that case, and must
 * never surface "[object Object]" as an error message.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const requestAccess = vi.fn();
const isConnected = vi.fn();
const getAddress = vi.fn();
const signTransaction = vi.fn();

vi.mock('@stellar/freighter-api', () => ({
  requestAccess: (...a: unknown[]) => requestAccess(...a),
  isConnected: (...a: unknown[]) => isConnected(...a),
  getAddress: (...a: unknown[]) => getAddress(...a),
  signTransaction: (...a: unknown[]) => signTransaction(...a),
}));

const { useFreighter } = await import('../../../src/ui/hooks/useFreighter');

const ADDR = 'GBL5RJKF4QNJ4ZPLJZ7PS7K5A4J44VEZJRV2CRTFFDRVSY2N76AIIE47';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useFreighter.connect', () => {
  it('succeeds when an address is returned (no error field)', async () => {
    isConnected.mockResolvedValue({ isConnected: false });
    requestAccess.mockResolvedValue({ address: ADDR });

    const { result } = renderHook(() => useFreighter());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pk: string | null = null;
    await act(async () => {
      pk = await result.current.connect();
    });
    expect(pk).toBe(ADDR);
    expect(result.current.error).toBeNull();
    expect(result.current.isConnected).toBe(true);
  });

  it('still succeeds when Freighter returns a benign empty error object', async () => {
    isConnected.mockResolvedValue({ isConnected: false });
    // The exact shape that used to render "[object Object]" and break connect.
    requestAccess.mockResolvedValue({ address: ADDR, error: {} });

    const { result } = renderHook(() => useFreighter());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pk: string | null = null;
    await act(async () => {
      pk = await result.current.connect();
    });
    expect(pk).toBe(ADDR);
    expect(result.current.error).toBeNull();
  });

  it('fails with a readable message (never "[object Object]") when no address', async () => {
    isConnected.mockResolvedValue({ isConnected: false });
    requestAccess.mockResolvedValue({ error: { message: 'User declined access' } });

    const { result } = renderHook(() => useFreighter());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pk: string | null = null;
    await act(async () => {
      pk = await result.current.connect();
    });
    expect(pk).toBeNull();
    expect(result.current.error).toBe('User declined access');
    expect(result.current.error).not.toContain('[object Object]');
  });

  it('coerces an object error with no message to JSON, never "[object Object]"', async () => {
    isConnected.mockResolvedValue({ isConnected: false });
    requestAccess.mockResolvedValue({ error: { code: -1 } });

    const { result } = renderHook(() => useFreighter());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).not.toContain('[object Object]');
    expect(result.current.error).toContain('code');
  });
});
