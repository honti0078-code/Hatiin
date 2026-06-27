import { and, eq, sql } from 'drizzle-orm';
import { USDC_ASSET_ISSUER_VALUE, env } from '@/server/config/env';
import {
  escrowClient,
  isEscrowAdminEnabled,
  minorToStroops,
  soroban,
} from '@/server/config/soroban';
import { db } from '@/server/db/client';
import { billPayments, bills, participants } from '@/server/db/schema';
import type { Bill, BillAsset, BillStatus } from '@/server/db/schema/bills';
import type { Participant } from '@/server/db/schema/participants';
import { eventBus } from '@/server/lib/eventBus';
import { AppError } from '@/server/lib/http';
import { logger } from '@/server/lib/logger';

export type BillWithParticipants = Bill & {
  participants: Participant[];
};

export type CreateBillInput = {
  title: string;
  description?: string;
  totalAmountMinor: string;
  // Settlement asset for the whole bill. Defaults to native XLM (no trustline,
  // works for any funded wallet); USDC is opt-in.
  asset?: BillAsset;
  participants: Array<{ publicKey: string; displayName: string }>;
};

export type RecordPaymentInput = {
  txHash: string;
  fromAddress: string;
  amountMinor: string;
};

export const billService = {
  async create(creatorPublicKey: string, input: CreateBillInput): Promise<BillWithParticipants> {
    const { title, description, totalAmountMinor, asset, participants: participantList } = input;

    if (participantList.length === 0) {
      throw new AppError('INVALID_INPUT', 'At least one participant required', 400);
    }

    const total = BigInt(totalAmountMinor);
    if (total <= 0n) {
      throw new AppError('INVALID_INPUT', 'totalAmountMinor must be positive', 400);
    }

    // Equal split — remainder goes to last participant
    const count = BigInt(participantList.length);
    const sharePerPerson = total / count;
    const remainder = total - sharePerPerson * count;

    const [bill] = await db
      .insert(bills)
      .values({
        creatorPublicKey,
        title,
        description,
        totalAmountMinor,
        asset: asset ?? 'xlm',
        participantCount: String(participantList.length),
        network: env.STELLAR_NETWORK,
      })
      .returning();

    const participantValues = participantList.map((p, i) => ({
      billId: bill.id,
      publicKey: p.publicKey,
      displayName: p.displayName,
      shareMinor: i === participantList.length - 1
        ? String(sharePerPerson + remainder)
        : String(sharePerPerson),
    }));

    const insertedParticipants = await db
      .insert(participants)
      .values(participantValues)
      .returning();

    logger.info('bill.created', { billId: bill.id, creatorPublicKey, participantCount: participantList.length });

    let finalBill: Bill = bill;

    // Open the bill on-chain in the SplitEscrow contract (XLM bills only). The
    // admin/deployer signs server-side; participants later fund their shares
    // INTO this contract, which releases the pot to the creator once full.
    // Best-effort: if the contract is unavailable, the bill still works via the
    // classic XLM payment fallback (contractBillId stays null).
    if ((bill.asset ?? 'xlm') === 'xlm' && isEscrowAdminEnabled()) {
      try {
        const deadline = Math.floor(Date.now() / 1000) + soroban.billTtlDays * 24 * 60 * 60;
        const { contractBillId, txHash } = await escrowClient().openBill(
          soroban.adminSecret as string,
          {
            creator: creatorPublicKey,
            totalAmount: minorToStroops(totalAmountMinor),
            numShares: participantList.length,
            deadline,
          },
        );
        const [updated] = await db
          .update(bills)
          .set({ contractBillId: String(contractBillId), contractOpenTxHash: txHash })
          .where(eq(bills.id, bill.id))
          .returning();
        finalBill = updated ?? bill;
        logger.info('bill.escrow_opened', { billId: bill.id, contractBillId, txHash });
      } catch (err) {
        logger.error('bill.escrow_open_failed', {
          billId: bill.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { ...finalBill, participants: insertedParticipants };
  },

  async getById(id: string): Promise<Bill> {
    const [row] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
    if (!row) throw new AppError('NOT_FOUND', 'Bill not found', 404);
    return row;
  },

  async getByCreator(publicKey: string): Promise<Bill[]> {
    return db
      .select()
      .from(bills)
      .where(eq(bills.creatorPublicKey, publicKey))
      .orderBy(sql`${bills.createdAt} desc`);
  },

  async getBillWithParticipants(id: string): Promise<BillWithParticipants> {
    const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
    if (!bill) throw new AppError('NOT_FOUND', 'Bill not found', 404);

    const billParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.billId, id))
      .orderBy(participants.createdAt);

    return { ...bill, participants: billParticipants };
  },

  async recordPayment(
    billId: string,
    participantId: string,
    input: RecordPaymentInput,
  ): Promise<{ bill: Bill; participant: Participant }> {
    const [bill] = await db.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('NOT_FOUND', 'Bill not found', 404);

    if (bill.status === 'settled') {
      throw new AppError('CONFLICT', 'Bill is already settled', 409);
    }

    const [participant] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.id, participantId), eq(participants.billId, billId)))
      .limit(1);

    if (!participant) throw new AppError('NOT_FOUND', 'Participant not found', 404);
    if (participant.status === 'paid') {
      throw new AppError('CONFLICT', 'Participant has already paid', 409);
    }

    const now = new Date();

    // Mark participant paid
    const [updatedParticipant] = await db
      .update(participants)
      .set({ status: 'paid', txHash: input.txHash, paidAt: now })
      .where(eq(participants.id, participantId))
      .returning();

    // Record payment
    await db.insert(billPayments).values({
      billId,
      participantId,
      txHash: input.txHash,
      fromAddress: input.fromAddress,
      amountMinor: input.amountMinor,
    });

    // Update bill paidAmount
    const newPaidAmount = (BigInt(bill.paidAmountMinor) + BigInt(input.amountMinor)).toString();

    // Check if all participants have paid
    const allParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.billId, billId));

    const allPaid = allParticipants.every((p) => p.id === participantId ? true : p.status === 'paid');

    const newBillStatus: BillStatus = allPaid ? 'settled' : bill.paidAmountMinor === '0' ? 'settling' : bill.status;

    const [updatedBill] = await db
      .update(bills)
      .set({
        paidAmountMinor: newPaidAmount,
        status: newBillStatus === 'open' ? 'settling' : newBillStatus,
        updatedAt: now,
      })
      .where(eq(bills.id, billId))
      .returning();

    logger.info('bill.payment_recorded', {
      billId,
      participantId,
      txHash: input.txHash,
      newStatus: updatedBill.status,
    });

    // Publish events for SSE fan-out
    eventBus.publish('participant.paid', {
      billId,
      participantId,
      publicKey: participant.publicKey,
      displayName: participant.displayName,
      status: 'paid',
      txHash: input.txHash,
      paidAt: now,
      occurredAt: now,
    });

    eventBus.publish('bill.updated', {
      billId,
      status: updatedBill.status,
      paidAmountMinor: updatedBill.paidAmountMinor,
      participantCount: updatedBill.participantCount,
      occurredAt: now,
    });

    return { bill: updatedBill, participant: updatedParticipant };
  },

  buildPaymentUri(bill: Bill, participant: Participant): string {
    const amount = minorToUsdc(participant.shareMinor);

    // SEP-7 URI for payment with bill ID as memo. XLM is native (no
    // asset_code/asset_issuer); USDC carries the issued-asset identity.
    const params: Record<string, string> = {
      destination: bill.creatorPublicKey,
      amount,
      memo: bill.id.replace(/-/g, '').slice(0, 28), // Stellar memo text max 28 bytes
      memo_type: 'text',
    };
    if (bill.asset !== 'xlm') {
      params.asset_code = env.USDC_ASSET_CODE;
      params.asset_issuer = USDC_ASSET_ISSUER_VALUE;
    }

    return `web+stellar:pay?${new URLSearchParams(params).toString()}`;
  },
};

/** Human-facing ticker for a bill's settlement asset. */
export function assetLabel(asset: BillAsset): string {
  return asset === 'xlm' ? 'XLM' : 'USDC';
}

export function minorToUsdc(minor: string): string {
  const n = BigInt(minor);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '00'}`;
}
