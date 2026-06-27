import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const authNonces = pgTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  publicKey: text('public_key').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export type AuthNonce = typeof authNonces.$inferSelect;
export type NewAuthNonce = typeof authNonces.$inferInsert;
