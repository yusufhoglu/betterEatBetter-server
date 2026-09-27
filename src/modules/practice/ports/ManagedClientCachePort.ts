/**
 * Short-lived cache of "does this user have an active dietitian link?" — read
 * on every AI-coach request, so it must not hit Postgres each time. Practice
 * invalidates the entry whenever a link starts or ends.
 */
export interface ManagedClientCachePort {
  get(clientId: string): Promise<boolean | null>;
  set(clientId: string, managed: boolean): Promise<void>;
  invalidate(clientId: string): Promise<void>;
}
