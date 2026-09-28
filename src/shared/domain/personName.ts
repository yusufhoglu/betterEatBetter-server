/**
 * Name shown to the other side of a dietitian–client relationship. Many
 * accounts never set a name (email sign-up, older Google sign-ins), which made
 * them appear as "—"; fall back to the email's local part in that case.
 * Username stays a separate field, so a set username still wins on clients.
 */
export function publicName(user: { name: string | null; username: string | null; email: string }): string | null {
  const name = user.name?.trim();
  if (name) return name;
  if (user.username) return null;
  const local = user.email.split('@')[0]?.trim();
  return local || null;
}
