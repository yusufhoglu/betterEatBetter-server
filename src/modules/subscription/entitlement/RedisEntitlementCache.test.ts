import { RedisEntitlementCache } from './RedisEntitlementCache';

describe('RedisEntitlementCache', () => {
  it('deletes the caller-scoped premium entitlement key', async () => {
    const del = jest.fn(async () => 1);
    await new RedisEntitlementCache({ del }).invalidate('u1');

    expect(del).toHaveBeenCalledWith('entitlement:premium:u1');
  });

  it('swallows a delete failure — the stale entry just expires on its own TTL', async () => {
    const del = jest.fn(async () => {
      throw new Error('redis down');
    });

    await expect(new RedisEntitlementCache({ del }).invalidate('u1')).resolves.toBeUndefined();
  });
});
