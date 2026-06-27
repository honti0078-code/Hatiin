import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const BILL_STATUSES = ['open', 'settling', 'settled'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];
export const billStatusEnum = pgEnum('bill_status', BILL_STATUSES);

// Settlement asset the bill is denominated in. USDC (issued, needs a trustline)
// or native XLM (no trustline required — works for any funded wallet).
export const BILL_ASSETS = ['usdc', 'xlm'] as const;
export type BillAsset = (typeof BILL_ASSETS)[number];
export const billAssetEnum = pgEnum('bill_asset', BILL_ASSETS);

export const bills = pgTable(
  'bills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorPublicKey: text('creator_public_key').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    totalAmountMinor: text('total_amount_minor').notNull(),
    paidAmountMinor: text('paid_amount_minor').notNull().default('0'),
    participantCount: text('participant_count').notNull().default('0'),
    status: billStatusEnum('status').notNull().default('open'),
    asset: billAssetEnum('asset').notNull().default('xlm'),
    network: text('network').notNull().default('testnet'),
    // On-chain SplitEscrow bill id (null for bills that did not open on-chain,
    // e.g. USDC bills, or when the contract was unavailable at creation).
    contractBillId: text('contract_bill_id'),
    // Tx hash of the on-chain `open_bill` call (escrow-backed bills only).
    contractOpenTxHash: text('contract_open_tx_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    creatorIdx: index('bills_creator_idx').on(t.creatorPublicKey),
    statusIdx: index('bills_status_idx').on(t.status),
  }),
);

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
