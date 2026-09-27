import {
  decodeInviteCode,
  encodeInviteCode,
  generateInviteKey,
  normalizeInviteCode,
} from './inviteCode';

const secret = 'test-invite-secret';
const now = new Date('2026-09-27T10:00:00.000Z');

describe('inviteCode', () => {
  it('round-trips the membership key and expiry', () => {
    const key = generateInviteKey();
    const issued = encodeInviteCode(key, 7, secret, now);

    expect(issued.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(issued.expiresAt.toISOString()).toBe('2026-10-04T23:59:59.999Z');

    const decoded = decodeInviteCode(issued.code, secret, now);
    expect(decoded).toEqual({ ok: true, inviteKey: key, expiresAt: issued.expiresAt });
  });

  it('accepts lower case, missing dashes and look-alike characters', () => {
    const issued = encodeInviteCode('0a1b2c3d', 3, secret, now);
    const sloppy = issued.code.toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l').replace(/0/g, 'o');

    expect(decodeInviteCode(sloppy, secret, now).ok).toBe(true);
    expect(normalizeInviteCode(sloppy)).toBe(issued.code.replace(/-/g, ''));
  });

  it('is still valid on its last day and expired the day after', () => {
    const issued = encodeInviteCode('0a1b2c3d', 1, secret, now);

    expect(decodeInviteCode(issued.code, secret, new Date('2026-09-28T23:59:00.000Z')).ok).toBe(true);
    expect(decodeInviteCode(issued.code, secret, new Date('2026-09-29T00:00:01.000Z'))).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
  });

  it('rejects a tampered code', () => {
    const issued = encodeInviteCode('0a1b2c3d', 30, secret, now);
    const chars = issued.code.replace(/-/g, '').split('');
    chars[5] = chars[5] === 'A' ? 'B' : 'A';

    expect(decodeInviteCode(chars.join(''), secret, now)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects a code signed with another secret', () => {
    const issued = encodeInviteCode('0a1b2c3d', 30, 'other-secret', now);

    expect(decodeInviteCode(issued.code, secret, now)).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects malformed input', () => {
    expect(decodeInviteCode('ABC', secret, now)).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(decodeInviteCode('UUUU-UUUU-UUUU-UUUU', secret, now)).toEqual({ ok: false, reason: 'MALFORMED' });
  });
});
