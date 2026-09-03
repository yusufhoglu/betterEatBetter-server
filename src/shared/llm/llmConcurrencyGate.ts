import { env } from '../config/env';
import { IntegrationError } from '../errors/IntegrationError';

export type LlmPriority = 'premium' | 'normal';

export interface ConcurrencyGateOptions {
  /** Max simultaneous holders for a `normal` caller. */
  maxConcurrent: number;
  /** Extra slots a `premium` caller may use on top of `maxConcurrent`. */
  premiumBurstSlots: number;
  /** Per-priority cap on the waiting line before {@link acquire} rejects. */
  maxQueueDepth: number;
}

/**
 * A bounded semaphore with a priority lane.
 *
 * `normal` callers are capped at `maxConcurrent`; `premium` callers may use up
 * to `maxConcurrent + premiumBurstSlots`, so a premium request almost never
 * queues even while a burst of free traffic has saturated the normal ceiling.
 * On release, a waiting premium caller is always served before a waiting
 * normal one. The burst slots only exist while premium traffic is live — under
 * a pure-normal flood every slot is still usable, nothing is reserved idle.
 *
 * Unlike cockatiel's `bulkhead`, a slot is held for as long as the caller
 * keeps the returned releaser un-called — so it can gate a streaming response
 * for its whole lifetime, not just the moment the stream is created.
 */
export class ConcurrencyGate {
  private active = 0;
  private readonly premiumWaiters: Array<() => void> = [];
  private readonly normalWaiters: Array<() => void> = [];

  constructor(private readonly options: ConcurrencyGateOptions) {}

  /** Resolves with a releaser once a slot is held. Rejects if the lane's queue is full. */
  async acquire(priority: LlmPriority = 'normal'): Promise<() => void> {
    const limit = this.limitFor(priority);

    if (this.active < limit) {
      this.active += 1;
      return this.makeReleaser();
    }

    const queue = priority === 'premium' ? this.premiumWaiters : this.normalWaiters;
    if (queue.length >= this.options.maxQueueDepth) {
      throw new IntegrationError(
        'LLM_OVERLOADED',
        'LLM request queue is full — too many concurrent requests',
        false,
        503,
      );
    }

    await new Promise<void>((resolve) => queue.push(resolve));
    // release() handed us the slot directly; `active` already counts us.
    return this.makeReleaser();
  }

  get stats(): { active: number; premiumQueued: number; normalQueued: number } {
    return {
      active: this.active,
      premiumQueued: this.premiumWaiters.length,
      normalQueued: this.normalWaiters.length,
    };
  }

  private limitFor(priority: LlmPriority): number {
    return priority === 'premium'
      ? this.options.maxConcurrent + this.options.premiumBurstSlots
      : this.options.maxConcurrent;
  }

  private makeReleaser(): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.handOff();
    };
  }

  private handOff(): void {
    const premium = this.premiumWaiters.shift();
    if (premium) {
      premium(); // premium lane can always take the freed slot — no count change
      return;
    }

    // A normal waiter may take it only if doing so keeps `normal` under its cap
    // (i.e. we're not just draining premium burst slots).
    if (this.normalWaiters.length > 0 && this.active - 1 < this.options.maxConcurrent) {
      const normal = this.normalWaiters.shift()!;
      normal();
      return;
    }

    this.active -= 1;
  }
}

/**
 * Process-wide gate shared by every outbound LLM call (chat turns, streaming
 * replies, structured-output estimators). Sized to keep total in-flight
 * requests under the provider's RPM/TPM ceiling; tune via env to your tier.
 */
export const llmConcurrencyGate = new ConcurrencyGate({
  maxConcurrent: env.LLM_MAX_CONCURRENCY,
  premiumBurstSlots: env.LLM_PREMIUM_BURST_SLOTS,
  maxQueueDepth: env.LLM_MAX_QUEUE_DEPTH,
});
