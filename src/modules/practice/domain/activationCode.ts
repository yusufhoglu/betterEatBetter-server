import { createHash, randomBytes } from 'node:crypto';

/**
 * Dietitian activation codes are admin-issued secrets (see
 * src/scripts/createActivationCode.ts). Unlike client invite codes they are
 * stored — as a SHA-256 hash only — because they carry usage limits and can
 * be revoked individually.
 */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // no 0/1/I/L/O/U look-alikes
const CODE_LENGTH = 12;

export function generateActivationCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

export function normalizeActivationCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function hashActivationCode(input: string): string {
  return createHash('sha256').update(normalizeActivationCode(input)).digest('hex');
}
