import type { SponsoredPremiumPort } from '../ports/SponsoredPremiumPort';
import type { SubscriptionRecord, SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';
import { GetSubscriptionEntitlement } from './GetSubscriptionEntitlement';

const NOW = new Date('2026-09-29T12:00:00Z');

function record(patch: Partial<SubscriptionRecord>): SubscriptionRecord {
  return {
    id: 's1',
    userId: 'u1',
    productId: 'premium_monthly',
    provider: 'google',
    status: 'active',
    expiresAt: new Date('2026-10-29T12:00:00Z'),
    purchaseToken: 'tok',
    willRenew: true,
    inGracePeriod: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function build(subscription: SubscriptionRecord | null, sponsored: boolean | 'throws' = false) {
  const repository = {
    findLatestByUserId: async () => subscription,
  } as unknown as SubscriptionRepositoryPort;
  const sponsor: SponsoredPremiumPort = {
    isSponsored: async () => {
      if (sponsored === 'throws') throw new Error('redis and postgres down');
      return sponsored;
    },
  };
  return new GetSubscriptionEntitlement(repository, sponsor);
}

describe('GetSubscriptionEntitlement', () => {
  it('a paying user is premium from their subscription, even with a dietitian', async () => {
    const entitlement = build(record({}), true);
    expect(await entitlement.execute('u1', NOW)).toBe(true);
    expect(await entitlement.describe('u1', NOW)).toMatchObject({
      isPremium: true,
      source: 'subscription',
      productId: 'premium_monthly',
      willRenew: true,
    });
  });

  it("a dietitian's client without a subscription is premium, sponsored by the dietitian", async () => {
    const entitlement = build(null, true);
    expect(await entitlement.execute('u1', NOW)).toBe(true);
    expect(await entitlement.describe('u1', NOW)).toEqual({
      isPremium: true,
      source: 'dietitian',
      productId: null,
      expiresAt: null,
      willRenew: false,
      inGracePeriod: false,
    });
  });

  it('a lapsed subscriber with a dietitian is still premium through the dietitian', async () => {
    const entitlement = build(record({ status: 'expired', expiresAt: new Date('2026-09-01T00:00:00Z') }), true);
    expect(await entitlement.describe('u1', NOW)).toMatchObject({ isPremium: true, source: 'dietitian' });
  });

  it('is free without a subscription or a dietitian, and keeps a lapsed subscription’s details', async () => {
    expect(await build(null).describe('u1', NOW)).toMatchObject({ isPremium: false, source: null });
    expect(await build(null).execute('u1', NOW)).toBe(false);

    const lapsed = await build(record({ status: 'expired', willRenew: false })).describe('u1', NOW);
    expect(lapsed).toMatchObject({ isPremium: false, source: null, productId: 'premium_monthly' });
  });

  it('a paying user never depends on the dietitian lookup', async () => {
    expect(await build(record({}), 'throws').execute('u1', NOW)).toBe(true);
  });

  it('without a sponsor port only store subscriptions count', async () => {
    const repository = { findLatestByUserId: async () => null } as unknown as SubscriptionRepositoryPort;
    expect(await new GetSubscriptionEntitlement(repository).execute('u1', NOW)).toBe(false);
  });
});
