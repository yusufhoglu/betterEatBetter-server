import { PremiumStatusCache, type EntitlementCacheStore, type EntitlementSource } from './PremiumStatusCache';

function makeStore(initial: Record<string, string> = {}): EntitlementCacheStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: jest.fn(async (key: string) => data[key] ?? null),
    set: jest.fn(async (key: string, value: string) => {
      data[key] = value;
    }),
    del: jest.fn(async (key: string) => {
      delete data[key];
    }),
  };
}

describe('PremiumStatusCache', () => {
  it('returns and caches a cache-miss result from the entitlement source', async () => {
    const source: EntitlementSource = { execute: jest.fn(async () => true) };
    const store = makeStore();
    const cache = new PremiumStatusCache(source, store, 60);

    expect(await cache.isPremium('u1')).toBe(true);
    expect(source.execute).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith('entitlement:premium:u1', '1', 'EX', 60);
  });

  it('serves a cache hit without touching the source', async () => {
    const source: EntitlementSource = { execute: jest.fn(async () => true) };
    const cache = new PremiumStatusCache(source, makeStore({ 'entitlement:premium:u1': '0' }), 60);

    expect(await cache.isPremium('u1')).toBe(false);
    expect(source.execute).not.toHaveBeenCalled();
  });

  it('fails open to free when the entitlement source throws', async () => {
    const source: EntitlementSource = {
      execute: jest.fn(async () => {
        throw new Error('db down');
      }),
    };
    const cache = new PremiumStatusCache(source, makeStore(), 60);

    expect(await cache.isPremium('u1')).toBe(false);
  });

  it('still consults the source when the cache read throws', async () => {
    const source: EntitlementSource = { execute: jest.fn(async () => true) };
    const store: EntitlementCacheStore = {
      get: jest.fn(async () => {
        throw new Error('redis down');
      }),
      set: jest.fn(async () => {
        throw new Error('redis down');
      }),
      del: jest.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const cache = new PremiumStatusCache(source, store, 60);

    expect(await cache.isPremium('u1')).toBe(true);
    expect(source.execute).toHaveBeenCalledTimes(1);
  });
});
