import { validatePasswordStrength } from './validatePasswordStrength';

describe('validatePasswordStrength', () => {
  test('rejects passwords shorter than 8 characters', () => {
    expect(validatePasswordStrength('1234567')).toBe(false);
  });

  test('accepts passwords exactly 8 characters long', () => {
    expect(validatePasswordStrength('12345678')).toBe(true);
  });

  test('accepts passwords longer than 8 characters', () => {
    expect(validatePasswordStrength('a-very-long-password')).toBe(true);
  });

  test('rejects an empty password', () => {
    expect(validatePasswordStrength('')).toBe(false);
  });
});
