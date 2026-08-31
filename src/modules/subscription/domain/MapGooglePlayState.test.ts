import { MapGooglePlayState } from './MapGooglePlayState';

function purchase(subscriptionState: string, overrides: Partial<{ autoRenewEnabled: boolean; productId: string }> = {}) {
  return {
    subscriptionState,
    lineItems: [
      {
        productId: overrides.productId ?? 'premium_yearly',
        expiryTime: '2026-09-24T00:00:00.000Z',
        autoRenewingPlan: { autoRenewEnabled: overrides.autoRenewEnabled ?? true },
      },
    ],
  };
}

describe('MapGooglePlayState', () => {
  test.each([
    ['SUBSCRIPTION_STATE_ACTIVE', 'active'],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'active'],
    ['SUBSCRIPTION_STATE_CANCELED', 'active'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'canceled'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'canceled'],
    ['SUBSCRIPTION_STATE_PAUSED', 'canceled'],
    ['SUBSCRIPTION_STATE_PENDING', 'canceled'],
  ])('maps %s to status %s', (subscriptionState, expectedStatus) => {
    const result = MapGooglePlayState(purchase(subscriptionState));
    expect(result.status).toBe(expectedStatus);
    expect(result.expiresAt).toEqual(new Date('2026-09-24T00:00:00.000Z'));
  });

  test('a canceled (but unexpired) subscription is still entitled — access lasts until expiry', () => {
    const result = MapGooglePlayState(purchase('SUBSCRIPTION_STATE_CANCELED', { autoRenewEnabled: false }));
    expect(result.status).toBe('active');
    expect(result.willRenew).toBe(false);
  });

  test('only SUBSCRIPTION_STATE_IN_GRACE_PERIOD reports inGracePeriod', () => {
    expect(MapGooglePlayState(purchase('SUBSCRIPTION_STATE_IN_GRACE_PERIOD')).inGracePeriod).toBe(true);
    expect(MapGooglePlayState(purchase('SUBSCRIPTION_STATE_ACTIVE')).inGracePeriod).toBe(false);
    expect(MapGooglePlayState(purchase('SUBSCRIPTION_STATE_CANCELED')).inGracePeriod).toBe(false);
  });

  test('willRenew reflects the line item autoRenewingPlan flag', () => {
    expect(MapGooglePlayState(purchase('SUBSCRIPTION_STATE_ACTIVE', { autoRenewEnabled: true })).willRenew).toBe(true);
    expect(MapGooglePlayState(purchase('SUBSCRIPTION_STATE_ACTIVE', { autoRenewEnabled: false })).willRenew).toBe(false);
  });

  test('extracts productId from the primary line item', () => {
    const result = MapGooglePlayState(purchase('SUBSCRIPTION_STATE_ACTIVE', { productId: 'premium_monthly' }));
    expect(result.productId).toBe('premium_monthly');
  });

  test('returns null productId and expiresAt, and false willRenew, when there are no line items', () => {
    const result = MapGooglePlayState({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [] });
    expect(result.productId).toBeNull();
    expect(result.expiresAt).toBeNull();
    expect(result.willRenew).toBe(false);
  });

  test('takes the latest expiryTime across multiple line items', () => {
    const result = MapGooglePlayState({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ expiryTime: '2026-01-01T00:00:00.000Z' }, { expiryTime: '2026-09-24T00:00:00.000Z' }],
    });

    expect(result.expiresAt).toEqual(new Date('2026-09-24T00:00:00.000Z'));
  });

  test('treats an unrecognized state as not entitled', () => {
    const result = MapGooglePlayState({ subscriptionState: 'SOME_FUTURE_STATE', lineItems: [] });
    expect(result.status).toBe('canceled');
  });
});
