import { StrKey } from '@stellar/stellar-sdk';
import { AppError } from '@/server/lib/http';

/**
 * SEP-2 Stellar Address Federation.
 *
 * Resolves a `name*domain` or `name@domain` (newer) identifier to a public
 * key. The federation server is hosted at the domain — we hit
 * `https://{domain}/.well-known/federation.json` with `?q=<name>&type=name`.
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0002.md
 */

const NAME_STAR_RE = /^([a-z0-9\-.+_]{1,64})\*([a-z0-9\-.]{1,253}\.[a-z]{2,})$/i;
const NAME_AT_RE = /^([a-z0-9\-.+_]{1,64})@([a-z0-9\-.]{1,253}\.[a-z]{2,})$/i;

export type ResolvedFederation = {
  account: string;
  memoType?: 'text' | 'id' | 'hash';
  memo?: string;
};

function isLikelyPubkey(input: string): boolean {
  return StrKey.isValidEd25519PublicKey(input);
}

function parseName(input: string): { name: string; domain: string } | null {
  const star = input.match(NAME_STAR_RE);
  if (star) return { name: star[1].toLowerCase(), domain: star[2].toLowerCase() };
  const at = input.match(NAME_AT_RE);
  if (at) return { name: at[1].toLowerCase(), domain: at[2].toLowerCase() };
  return null;
}

export async function resolveFederation(input: string): Promise<ResolvedFederation> {
  if (isLikelyPubkey(input)) {
    return { account: input };
  }
  const parsed = parseName(input);
  if (!parsed) {
    throw new AppError(
      'INVALID_INPUT',
      'Destination is not a valid public key or federation name',
      400,
    );
  }
  const url = `https://${parsed.domain}/.well-known/federation.json?q=${encodeURIComponent(parsed.name)}&type=name`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    throw new AppError(
      'INTERNAL',
      `Federation lookup failed for ${parsed.domain}: ${String(err)}`,
      502,
    );
  }
  if (res.status === 404) {
    throw new AppError('NOT_FOUND', `Federation name not found: ${input}`, 404);
  }
  if (!res.ok) {
    throw new AppError('INTERNAL', `Federation lookup returned ${res.status}`, 502);
  }
  const body = (await res.json()) as { account?: string; memo_type?: string; memo?: string };
  if (!body.account || !StrKey.isValidEd25519PublicKey(body.account)) {
    throw new AppError('INTERNAL', 'Federation server returned an invalid account', 502);
  }
  const memoType =
    body.memo_type === 'id' || body.memo_type === 'hash' || body.memo_type === 'text'
      ? body.memo_type
      : undefined;
  return {
    account: body.account,
    memoType,
    memo: body.memo,
  };
}
