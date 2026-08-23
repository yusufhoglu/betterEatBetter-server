const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
