import { EventEmitter } from 'node:events';

/**
 * In-process typed event bus for Hatiin bill-splitting SSE fan-out.
 * Publishes bill and participant events to SSE stream handlers.
 */

export type BillEvent = {
  billId: string;
  status: string;
  paidAmountMinor: string;
  participantCount: string;
  occurredAt: Date;
};

export type ParticipantEvent = {
  billId: string;
  participantId: string;
  publicKey: string;
  displayName: string;
  status: string;
  txHash: string | null;
  paidAt: Date | null;
  occurredAt: Date;
};

export type EventMap = {
  'bill.updated': BillEvent;
  'participant.paid': ParticipantEvent;
};

type Topic = keyof EventMap;

class TypedBus {
  private readonly emitter = new EventEmitter();
  private readonly counts = new Map<Topic, number>();

  constructor() {
    // Default limit is 10; raise it so a busy merchant's dashboard doesn't trip it.
    this.emitter.setMaxListeners(1000);
  }

  publish<T extends Topic>(topic: T, payload: EventMap[T]): void {
    setImmediate(() => this.emitter.emit(topic, payload));
  }

  /**
   * Subscribe to a topic. Returns an `unsubscribe` function (also bound to the
   * supplied `AbortSignal` if provided).
   */
  subscribe<T extends Topic>(
    topic: T,
    callback: (payload: EventMap[T]) => void,
    signal?: AbortSignal,
  ): () => void {
    this.emitter.on(topic, callback as (...args: unknown[]) => void);
    const count = (this.counts.get(topic) ?? 0) + 1;
    this.counts.set(topic, count);
    const unsubscribe = () => {
      this.emitter.off(topic, callback as (...args: unknown[]) => void);
      const next = (this.counts.get(topic) ?? 1) - 1;
      this.counts.set(topic, Math.max(0, next));
    };
    if (signal) {
      const onAbort = () => unsubscribe();
      if (signal.aborted) {
        unsubscribe();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    return unsubscribe;
  }

  /** For tests and admin: number of current subscribers per topic. */
  subscriberCount(topic: Topic): number {
    return this.counts.get(topic) ?? 0;
  }

  /** For tests. */
  reset(): void {
    this.emitter.removeAllListeners();
    this.counts.clear();
  }
}

export const eventBus = new TypedBus();
