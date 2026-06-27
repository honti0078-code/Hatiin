import { randomBytes } from 'node:crypto';
import {
  Account,
  BASE_FEE,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { env } from '@/server/config/env';
import { stellar } from '@/server/config/stellar';
import { db } from '@/server/db/client';
import { authNonces, sessions } from '@/server/db/schema';
import { AppError } from '@/server/lib/http';

function randomNonce(): string {
  return randomBytes(24).toString('base64url');
}

export const authService = {
  async createChallenge(
    publicKey: string,
  ): Promise<{ nonce: string; txXdr: string; expiresAt: Date }> {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new AppError('INVALID_PUBLIC_KEY', 'Stellar public key is invalid', 400);
    }
    const nonce = randomNonce();
    const expiresAt = new Date(Date.now() + env.NONCE_TTL_SECONDS * 1000);

    // Build a challenge transaction with the nonce embedded as ManageData.
    // This transaction is never submitted to the network — its only purpose
    // is to be signed by the user's wallet as proof of key ownership.
    const account = new Account(publicKey, '0');
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: stellar.passphrase,
    })
      .addOperation(Operation.manageData({ name: 'auth_nonce', value: Buffer.from(nonce) }))
      .setTimeout(env.NONCE_TTL_SECONDS)
      .build();

    await db.insert(authNonces).values({ nonce, publicKey, expiresAt });
    return { nonce, txXdr: tx.toXDR(), expiresAt };
  },

  async verifyAndCreateSession(
    publicKey: string,
    signedTxXdr: string,
  ): Promise<{ sessionId: string }> {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new AppError('INVALID_PUBLIC_KEY', 'Stellar public key is invalid', 400);
    }

    // Parse the signed transaction and verify the user's ed25519 signature.
    // Freighter signs sha256(network_id + tx_envelope_xdr) — the standard Stellar tx hash.
    let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
    try {
      tx = TransactionBuilder.fromXDR(signedTxXdr, stellar.passphrase);
    } catch {
      throw new AppError('UNAUTHORIZED', 'Invalid transaction XDR', 401);
    }

    const txHash = tx.hash();
    const kp = Keypair.fromPublicKey(publicKey);
    const hasValidSig = tx.signatures.some((sig) => {
      try {
        return kp.verify(txHash, sig.signature());
      } catch {
        return false;
      }
    });
    if (!hasValidSig) {
      throw new AppError('UNAUTHORIZED', 'Signature does not match transaction', 401);
    }

    // Extract the nonce from the ManageData operation in the transaction.
    const op = tx.operations.find((o) => o.type === 'manageData') as
      | { type: 'manageData'; name: string; value: Buffer | null }
      | undefined;
    if (!op || op.name !== 'auth_nonce' || !op.value) {
      throw new AppError('UNAUTHORIZED', 'Challenge operation not found in transaction', 401);
    }
    const nonce = op.value.toString('utf8');

    // Look up the nonce and confirm it is unconsumed and unexpired.
    const now = new Date();
    const [matched] = await db
      .select()
      .from(authNonces)
      .where(
        and(
          eq(authNonces.publicKey, publicKey),
          eq(authNonces.nonce, nonce),
          isNull(authNonces.consumedAt),
          gt(authNonces.expiresAt, now),
        ),
      );

    if (!matched) {
      throw new AppError('UNAUTHORIZED', 'Nonce not found or expired', 401);
    }

    await db
      .update(authNonces)
      .set({ consumedAt: new Date() })
      .where(eq(authNonces.nonce, matched.nonce));

    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);
    const [session] = await db
      .insert(sessions)
      .values({ publicKey, expiresAt })
      .returning({ id: sessions.id });
    return { sessionId: session.id };
  },

  async destroySession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  },
};
