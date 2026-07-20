export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import {
  Asset,
  BASE_FEE,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { stellar } from '@/server/config/stellar';
import { AppError, ok } from '@/server/lib/http';
import type { HandlerContext } from '@/server/middleware/compose';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { billService, minorToUsdc } from '@/server/service/bill.service';
import { escrowClient, isEscrowEnabled, minorToStroops } from '@/server/config/soroban';
import { usdcAsset, usdcCode, usdcIssuer } from '@/server/stellar/network';

const schema = z.object({
  participantId: z.string().uuid(),
  // Optional payer override. Defaults to the bill's persisted settlement asset
  // (chosen at creation). USDC needs a trustline; XLM (native) does not.
  asset: z.enum(['usdc', 'xlm']).optional(),
});

/**
 * Build an UNSIGNED USDC payment transaction (participant -> bill creator) for
 * the participant's exact share. The client signs it with Freighter and submits
 * it via the sibling `submit` route. This is the app's real on-chain pay path.
 */
async function buildPayment(req: NextRequest, ctx: HandlerContext) {
  const params = await ctx.params;
  const billId = params?.id as string;
  const { participantId, asset: requestedAsset } = schema.parse(await req.json());

  const bill = await billService.getBillWithParticipants(billId);
  // The bill carries its settlement asset (chosen at creation): USDC or native
  // XLM. The payer may override at pay time; otherwise the bill's asset wins.
  // XLM needs no trustline; USDC does.
  const assetChoice: 'usdc' | 'xlm' =
    requestedAsset ?? (bill.asset === 'xlm' ? 'xlm' : 'usdc');
  if (bill.status === 'settled') {
    throw new AppError('CONFLICT', 'Bill is already settled', 409);
  }
  const participant = bill.participants.find((p) => p.id === participantId);
  if (!participant) throw new AppError('NOT_FOUND', 'Participant not found', 404);
  if (participant.status === 'paid') {
    throw new AppError('CONFLICT', 'Participant has already paid', 409);
  }

  // On-chain core flow: an XLM bill that was opened in the SplitEscrow contract
  // is funded by paying the share INTO the contract (pay_share). The contract
  // releases the pooled total to the creator once fully funded. Build the
  // unsigned Soroban invoke for the participant to sign with Freighter.
  if (assetChoice === 'xlm' && bill.contractBillId && isEscrowEnabled()) {
    let xdr: string;
    try {
      xdr = await escrowClient().buildPayShare({
        contractBillId: Number(bill.contractBillId),
        payer: participant.publicKey,
        amount: minorToStroops(participant.shareMinor),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/getAccount|not found|NotFound|404/i.test(msg)) {
        throw new AppError(
          'NOT_FOUND',
          'Your wallet account is not active on Stellar testnet yet. Fund it (e.g. via friendbot) and try again.',
          404,
        );
      }
      throw new AppError(
        'CONFLICT',
        'Could not prepare the on-chain contribution. The bill may already be settled — refresh and try again.',
        422,
      );
    }
    return ok({
      xdr,
      amountMinor: participant.shareMinor,
      amount: minorToUsdc(participant.shareMinor),
      asset: 'xlm',
      assetCode: 'XLM',
      destination: bill.creatorPublicKey,
      via: 'contract',
    });
  }

  let account: Awaited<ReturnType<typeof stellar.server.loadAccount>>;
  try {
    account = await stellar.server.loadAccount(participant.publicKey);
  } catch {
    throw new AppError(
      'NOT_FOUND',
      'Payer account not found on network (fund it on testnet first)',
      404,
    );
  }

  // Pre-flight (USDC only): the recipient must hold a USDC trustline (or BE the
  // issuer), otherwise Horizon rejects the payment with `op_no_trust` — but only
  // AFTER the payer has signed. Check it here and fail fast with a clear,
  // actionable message so nobody signs a doomed transaction. XLM (native) needs
  // no trustline, so this check is skipped for it.
  const code = usdcCode();
  const issuer = usdcIssuer();
  if (assetChoice === 'usdc' && bill.creatorPublicKey !== issuer) {
    let destAccount: Awaited<ReturnType<typeof stellar.server.loadAccount>>;
    try {
      destAccount = await stellar.server.loadAccount(bill.creatorPublicKey);
    } catch {
      throw new AppError(
        'CONFLICT',
        `The recipient account is not active on Stellar ${stellar.network} yet. The bill creator must fund it and add a ${code} trustline before it can receive payments.`,
        422,
      );
    }
    const hasTrustline = destAccount.balances.some(
      (b) =>
        'asset_code' in b &&
        b.asset_code === code &&
        'asset_issuer' in b &&
        b.asset_issuer === issuer,
    );
    if (!hasTrustline) {
      const shortIssuer = `${issuer.slice(0, 6)}…${issuer.slice(-4)}`;
      throw new AppError(
        'CONFLICT',
        `The recipient hasn't enabled ${code} yet, so they can't receive it. Ask the bill creator to add a ${code} trustline (asset ${code}, issuer ${shortIssuer}) in their Stellar wallet, then try again.`,
        422,
      );
    }
  }

  const amount = minorToUsdc(participant.shareMinor);
  const memo = bill.id.replace(/-/g, '').slice(0, 28);
  const payAsset = assetChoice === 'xlm' ? Asset.native() : usdcAsset();

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: stellar.passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: bill.creatorPublicKey,
        asset: payAsset,
        amount,
      }),
    )
    .addMemo(Memo.text(memo))
    .setTimeout(180)
    .build();

  return ok({
    xdr: tx.toXDR(),
    amountMinor: participant.shareMinor,
    amount,
    asset: assetChoice,
    assetCode: assetChoice === 'xlm' ? 'XLM' : code,
    destination: bill.creatorPublicKey,
    via: 'classic',
  });
}

export const POST = compose(withError, withRateLimit)(buildPayment);
