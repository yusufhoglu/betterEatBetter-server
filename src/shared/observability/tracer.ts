import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceContext {
  traceId: string;
  userId?: string;
  messageId?: string;
  /** True once entitlement has resolved the request as a premium user. */
  isPremium?: boolean;
}

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Every async flow that does NOT originate from an in-flight HTTP request
 * (BullMQ job, cron/scheduled job, event handler) must call this before doing
 * any work — the store is not inherited automatically outside that chain.
 */
export function runWithContext<T>(context: TraceContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

export function getTraceContext(): TraceContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getTraceId(): string | undefined {
  return asyncLocalStorage.getStore()?.traceId;
}

export function getUserId(): string | undefined {
  return asyncLocalStorage.getStore()?.userId;
}

/** Mutates the current store in place — called once auth has resolved the user. */
export function setUserId(userId: string): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.userId = userId;
  }
}

/** Chatbot exception: trace_id stays fixed per conversation, messageId varies per request. */
export function setMessageId(messageId: string): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.messageId = messageId;
  }
}

/** Mutates the current store in place — called once entitlement has resolved. */
export function setPremium(isPremium: boolean): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.isPremium = isPremium;
  }
}

/** Whether the in-flight request belongs to a premium user (false when unknown). */
export function isPremiumRequest(): boolean {
  return asyncLocalStorage.getStore()?.isPremium === true;
}
