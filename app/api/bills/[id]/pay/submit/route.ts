export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { TransactionBuilder } from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { escrowClient } from '@/server/config/soroban';
import { stellar } from '@/server/config/stellar';
import { AppError, ok } from '@/server/lib/http';
import type { HandlerContext } from '@/server/middleware/compose';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';
import { billService } from '@/server/service/bill.service';

const schema = z.object({
  participantId: z.string().uuid(),
  signedXdr: z.string().min(1),
});

/**
 * Turn cryptic Horizon `result_codes` into a clear, actionable message for the
 * payer. Covers the common testnet failures; falls back to the raw codes.
 */
function friendlyHorizonError(
  codes: { operations?: string[]; transaction?: string } | null,
  asset = 'USDC',
): string {
  const ops = codes?.operations ?? [];
  if (ops.includes('op_no_trust')) {
    return `The recipient hasn't enabled ${asset} yet, so they can't receive it. Ask the bill creator to add a ${asset} trustline in their Stellar wallet (or use the "Enable ${asset}" button), then try again.`;
  }
  if (ops.includes('op_no_destination')) {
    return 'The recipient account does not exist on Stellar yet. The bill creator needs to fund and activate it first.';
  }
  if (ops.includes('op_underfunded') || codes?.transaction === 'tx_insufficient_balance') {
    return `Your wallet doesn't have enough ${asset} to cover this share. Top up your ${asset} balance and try again.`;
  }
  if (ops.includes('op_line_full')) {
    return `The recipient's ${asset} balance is at its trustline limit and cannot accept more right now.`;
  }
  if (codes?.transaction === 'tx_bad_seq') {
    return 'The transaction was out of date (sequence changed). Please try paying again.';
  }
  const detail = codes ? `: ${JSON.stringify(codes)}` : '';
  return `Stellar rejected the payment${detail}. Please try again.`;
}

/**
 * Submit the Freighter-signed payment XDR to Horizon, then record the on-chain
 * settlement against the participant's share. Settles the bill when the last
 * pending share is paid.
 */
async function submitPayment(req: NextRequest, ctx: HandlerContext) {
  const params = await ctx.params;
  const billId = params?.id as string;
  const { participantId, signedXdr } = schema.parse(await req.json());

  const bill = await billService.getBillWithParticipants(billId);
  const assetLabel = bill.asset === 'xlm' ? 'XLM' : 'USDC';
  const participant = bill.participants.find((p) => p.id === participantId);
  if (!participant) throw new AppError('NOT_FOUND', 'Participant not found', 404);

  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, stellar.passphrase);
  } catch {
    throw new AppError('INVALID_INPUT', 'Invalid signed transaction XDR', 400);
  }

  // A Soroban `pay_share` invoke (XLM escrow bills) is submitted via Soroban
  // RPC, not Horizon. Detect it by its single invokeHostFunction operation.
  const op = (tx as { operations?: Array<{ type?: string }> }).operations?.[0];
  if (op?.type === 'invokeHostFunction') {
    let hash: string;
    try {
      const res = await escrowClient().submit(signedXdr);
      hash = res.txHash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        'CONFLICT',
        `The on-chain contribution was rejected (${msg.slice(0, 140)}). Make sure your wallet holds enough XLM, then try again.`,
        422,
      );
    }
    const settled = await billService.recordPayment(billId, participantId, {
      txHash: hash,
      fromAddress: (tx as { source: string }).source,
      amountMinor: participant.shareMinor,
    });
    return ok({ bill: settled.bill, participant: settled.participant, txHash: hash, via: 'contract' });
  }

  let hash: string;
  let fromAddress: string;
  try {
    // submitTransaction accepts a Transaction; cast for the union return of fromXDR.
    const result = await stellar.server.submitTransaction(
      // biome-ignore lint/suspicious/noExplicitAny: SDK union vs Transaction
      tx as any,
    );
    hash = result.hash;
    fromAddress = (tx as { source: string }).source;
  } catch (err) {
    const codes =
      (err as { response?: { data?: { extras?: { result_codes?: { operations?: string[]; transaction?: string } } } } })
        ?.response?.data?.extras?.result_codes ?? null;
    throw new AppError('CONFLICT', friendlyHorizonError(codes, assetLabel), 422);
  }

  const result = await billService.recordPayment(billId, participantId, {
    txHash: hash,
    fromAddress,
    amountMinor: participant.shareMinor,
  });

  return ok({ bill: result.bill, participant: result.participant, txHash: hash });
}

export const POST = compose(withError, withRateLimit)(submitPayment);
