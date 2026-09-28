import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { decodeInviteCode } from '../domain/inviteCode';
import type { DietitianProfile } from '../domain/practiceTypes';
import type { MembershipWithOrganization, PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

export interface ResolvedInvite {
  membership: MembershipWithOrganization;
  profile: DietitianProfile;
  expiresAt: Date;
}

/**
 * Malformed, forged, expired and revoked codes all surface as the same
 * INVITE_CODE_INVALID — telling them apart would help someone brute-force.
 */
export async function resolveInvite(
  repository: PracticeRepositoryPort,
  code: string,
  secret: string,
  now: Date,
): Promise<ResolvedInvite> {
  const decoded = decodeInviteCode(code, secret, now);
  if (!decoded.ok) {
    throw invalidInvite();
  }

  const membership = await repository.findActiveMembershipByInviteKey(decoded.inviteKey);
  const profile = membership ? await repository.findDietitianProfile(membership.userId) : null;
  if (!membership || !profile) {
    throw invalidInvite();
  }

  return { membership, profile, expiresAt: decoded.expiresAt };
}

function invalidInvite(): NotFoundError {
  return new NotFoundError('INVITE_CODE_INVALID', 'Invite code is invalid or expired');
}
