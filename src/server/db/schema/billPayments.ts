import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { participants } from './participants';
import { bills } from './bills';

export const billPayments = pgTable('bill_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  txHash: text('tx_hash').notNull(),
  fromAddress: text('from_address').notNull(),
  amountMinor: text('amount_minor').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type BillPayment = typeof billPayments.$inferSelect;
export type NewBillPayment = typeof billPayments.$inferInsert;
