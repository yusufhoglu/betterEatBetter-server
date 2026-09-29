import { randomInt } from 'node:crypto';

// No look-alikes (0/O, 1/l/I) so a password read off the screen types correctly.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** e.g. "Kx7m-Pq2r-Tw9z": 12 random characters (~70 bits), grouped for reading aloud. */
export function generatePassword(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((group) => group.join('')).join('-');
}
