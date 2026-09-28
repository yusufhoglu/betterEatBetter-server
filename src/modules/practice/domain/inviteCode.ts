import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Stateless client invite codes. Everything needed to validate a code is in
 * the code itself — there is no invites table:
 *
 *   bytes 0-3  membership invite key (OrganizationMember.inviteKey, random)
 *   bytes 4-5  expiry, as whole UTC days since INVITE_EPOCH (uint16, big-endian)
 *   bytes 6-9  HMAC-SHA256(secret, bytes 0-5), truncated to 4 bytes
 *
 * 10 bytes → 16 Crockford base32 chars, shown as XXXX-XXXX-XXXX-XXXX so a
 * client can read it out over the phone. The key identifies *which
 * dietitian in which organization*; the MAC stops anyone forging a code or
 * stretching its expiry. Rotating the membership's inviteKey revokes every
 * code issued before. A 32-bit MAC is only safe because join attempts are
 * rate limited per user.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const INVITE_EPOCH_MS = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY_BYTES = 4;
const MAC_BYTES = 4;
const CODE_BYTES = KEY_BYTES + 2 + MAC_BYTES;
const CODE_CHARS = 16;

export const MIN_INVITE_VALIDITY_DAYS = 1;
export const MAX_INVITE_VALIDITY_DAYS = 365;

/** Random membership key, stored as 8 lowercase hex chars. */
export function generateInviteKey(): string {
  return randomBytes(KEY_BYTES).toString('hex');
}

function toDayNumber(date: Date): number {
  return Math.floor((date.getTime() - INVITE_EPOCH_MS) / DAY_MS);
}

function mac(secret: string, payload: Buffer): Buffer {
  return createHmac('sha256', secret).update(payload).digest().subarray(0, MAC_BYTES);
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function decodeBase32(text: string): Buffer | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) {
      return null;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Crockford normalisation: case-insensitive, ignores separators, I/L→1, O→0. */
export function normalizeInviteCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

export function formatInviteCode(normalized: string): string {
  return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
}

export interface IssuedInviteCode {
  code: string;
  expiresAt: Date;
}

/** `validityDays` counts whole days; the code stays valid through the end of its last UTC day. */
export function encodeInviteCode(inviteKey: string, validityDays: number, secret: string, now = new Date()): IssuedInviteCode {
  const keyBytes = Buffer.from(inviteKey, 'hex');
  if (keyBytes.length !== KEY_BYTES) {
    throw new RangeError('inviteKey must be 4 bytes of hex');
  }

  const expiryDay = toDayNumber(now) + validityDays;
  const payload = Buffer.alloc(KEY_BYTES + 2);
  keyBytes.copy(payload, 0);
  payload.writeUInt16BE(expiryDay, KEY_BYTES);

  const code = encodeBase32(Buffer.concat([payload, mac(secret, payload)]));
  return {
    code: formatInviteCode(code),
    expiresAt: new Date(INVITE_EPOCH_MS + (expiryDay + 1) * DAY_MS - 1),
  };
}

export type DecodedInviteCode =
  | { ok: true; inviteKey: string; expiresAt: Date }
  | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' };

export function decodeInviteCode(input: string, secret: string, now = new Date()): DecodedInviteCode {
  const normalized = normalizeInviteCode(input);
  if (normalized.length !== CODE_CHARS) {
    return { ok: false, reason: 'MALFORMED' };
  }

  const bytes = decodeBase32(normalized);
  if (!bytes || bytes.length !== CODE_BYTES) {
    return { ok: false, reason: 'MALFORMED' };
  }

  const payload = bytes.subarray(0, KEY_BYTES + 2);
  const presentedMac = bytes.subarray(KEY_BYTES + 2);
  if (!timingSafeEqual(presentedMac, mac(secret, payload))) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  const expiryDay = payload.readUInt16BE(KEY_BYTES);
  if (toDayNumber(now) > expiryDay) {
    return { ok: false, reason: 'EXPIRED' };
  }

  return {
    ok: true,
    inviteKey: payload.subarray(0, KEY_BYTES).toString('hex'),
    expiresAt: new Date(INVITE_EPOCH_MS + (expiryDay + 1) * DAY_MS - 1),
  };
}
