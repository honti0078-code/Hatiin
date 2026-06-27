import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bills } from './bills';

export const PARTICIPANT_STATUSES = ['pending', 'paid'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export const participantStatusEnum = pgEnum('participant_status', PARTICIPANT_STATUSES);

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    displayName: text('display_name').notNull(),
    shareMinor: text('share_minor').notNull(),
    status: participantStatusEnum('status').notNull().default('pending'),
    txHash: text('tx_hash'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    billIdx: index('participants_bill_idx').on(t.billId),
    pkIdx: index('participants_pk_idx').on(t.publicKey),
  }),
);

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
