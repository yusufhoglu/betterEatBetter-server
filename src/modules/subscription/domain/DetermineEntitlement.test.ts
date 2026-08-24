import { DetermineEntitlement } from './DetermineEntitlement';

describe('DetermineEntitlement', () => {
  it('returns true for an active subscription that expires in the future', () => {
    expect(
      DetermineEntitlement({
        status: 'active',
        expiresAt: new Date('2026-08-25T00:00:00.000Z'),
        now: new Date('2026-08-24T00:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('returns false for an expired active subscription', () => {
    expect(
      DetermineEntitlement({
        status: 'active',
        expiresAt: new Date('2026-08-23T00:00:00.000Z'),
        now: new Date('2026-08-24T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('returns false for a canceled subscription regardless of expiry', () => {
    expect(
      DetermineEntitlement({
        status: 'canceled',
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        now: new Date('2026-08-24T00:00:00.000Z'),
      }),
    ).toBe(false);
  });
});
