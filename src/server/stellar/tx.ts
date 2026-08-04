import { AppError } from '@/server/lib/http';
import { getHorizonUrl } from './network';

/**
 * Shapes we care about from Horizon. The Horizon REST API returns more fields
 * than we model; we only pick what the hub actually needs.
 */
export type HorizonPayment = {
  id: string;
  type:
    | 'payment'
    | 'path_payment_strict_send'
    | 'path_payment_strict_receive'
    | 'create_account'
    | 'account_merge';
  amount: string;
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  asset_code?: string;
  asset_issuer?: string;
  from: string;
  to: string;
  transaction_hash: string;
  transaction_successful: boolean;
  created_at: string;
};

export type HorizonTransaction = {
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  successful: boolean;
  fee_charged: string;
  max_fee: string;
  operation_count: number;
  envelope_xdr: string;
  result_xdr: string;
  memo_type: string;
  memo?: string;
  memo_bytes?: string;
};

type HorizonError = {
  response?: { status?: number; data?: { status?: number; title?: string; detail?: string } };
};

async function horizonFetch<T>(path: string): Promise<T> {
  const url = `${getHorizonUrl().replace(/\/$/, '')}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Horizon request failed: ${String(err)}`, 502);
  }
  if (res.status === 404) {
    const err = new Error('Not found') as HorizonError & Error;
    err.response = { status: 404 };
    throw err;
  }
  if (!res.ok) {
    throw new AppError('INTERNAL', `Horizon returned ${res.status}`, 502);
  }
  return (await res.json()) as T;
}

export async function getTransaction(hash: string): Promise<HorizonTransaction> {
  try {
    return await horizonFetch<HorizonTransaction>(`/transactions/${hash}`);
  } catch (err) {
    if ((err as HorizonError).response?.status === 404) {
      throw new AppError('NOT_FOUND', 'Transaction not found', 404);
    }
    throw err;
  }
}

export async function getTransactionPayments(hash: string): Promise<HorizonPayment[]> {
  type Resp = { _embedded: { records: HorizonPayment[] } };
  const resp = await horizonFetch<Resp>(`/transactions/${hash}/payments`);
  return resp._embedded.records;
}

/**
 * Best-effort account balance lookup for a non-native asset. Returns `null`
 * if the account does not exist or has no trustline.
 */
export type AccountBalance = { asset_code: string; asset_issuer: string; balance: string };

export async function getAccountBalances(account: string): Promise<AccountBalance[]> {
  type Account = {
    balances: Array<{
      asset_type: string;
      asset_code?: string;
      asset_issuer?: string;
      balance: string;
    }>;
  };
  try {
    const acct = await horizonFetch<Account>(`/accounts/${account}`);
    return acct.balances
      .filter((b) => b.asset_type !== 'native' && b.asset_code && b.asset_issuer)
      .map((b) => ({
        asset_code: b.asset_code as string,
        asset_issuer: b.asset_issuer as string,
        balance: b.balance,
      }));
  } catch (err) {
    if ((err as HorizonError).response?.status === 404) {
      return [];
    }
    throw err;
  }
}

export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await horizonFetch<unknown>(`/accounts/${publicKey}`);
    return true;
  } catch (err) {
    if ((err as HorizonError).response?.status === 404) return false;
    throw err;
  }
}
