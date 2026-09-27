import type { ManagedClientCachePort } from '../../ports/ManagedClientCachePort';

export class InMemoryManagedClientCache implements ManagedClientCachePort {
  readonly values = new Map<string, boolean>();

  async get(clientId: string): Promise<boolean | null> {
    return this.values.get(clientId) ?? null;
  }

  async set(clientId: string, managed: boolean): Promise<void> {
    this.values.set(clientId, managed);
  }

  async invalidate(clientId: string): Promise<void> {
    this.values.delete(clientId);
  }
}
