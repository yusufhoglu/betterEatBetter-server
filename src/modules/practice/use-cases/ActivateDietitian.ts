import { ConflictError } from '../../../shared/errors/ConflictError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { hashActivationCode } from '../domain/activationCode';
import { generateInviteKey } from '../domain/inviteCode';
import type { MembershipWithOrganization, PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { DietitianProfile } from '../domain/practiceTypes';

export interface ActivateDietitianInput {
  userId: string;
  code: string;
}

export interface ActivateDietitianResult {
  profile: DietitianProfile;
  membership: MembershipWithOrganization;
}

/**
 * Turns a user into a dietitian with an admin-issued activation code. A code
 * bound to an organization adds the user to that clinic with the code's role;
 * an unbound code creates a one-member 'solo' organization. Invalid, expired,
 * revoked and used-up codes are indistinguishable to the caller.
 */
export class ActivateDietitian {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ActivateDietitianInput): Promise<ActivateDietitianResult> {
    const now = this.now();
    const code = await this.repository.findActivationCodeByHash(hashActivationCode(input.code));
    if (
      !code ||
      code.revokedAt !== null ||
      (code.expiresAt !== null && code.expiresAt <= now) ||
      code.usedCount >= code.maxUses
    ) {
      throw invalidCode();
    }

    const [profile, memberships] = await Promise.all([
      this.repository.findDietitianProfile(input.userId),
      this.repository.listActiveMemberships(input.userId),
    ]);
    if (code.organizationId === null && profile) {
      throw new ConflictError('ALREADY_DIETITIAN', 'This account is already a dietitian');
    }
    if (code.organizationId !== null && memberships.some((m) => m.organizationId === code.organizationId)) {
      throw new ConflictError('ALREADY_ORGANIZATION_MEMBER', 'You are already a member of this organization');
    }

    const person = (await this.repository.getPeople([input.userId])).get(input.userId);
    const result = await this.repository.redeemActivationCode({
      codeId: code.id,
      userId: input.userId,
      organizationId: code.organizationId,
      orgRole: code.organizationId === null ? 'owner' : code.orgRole,
      soloOrganizationName: person?.name?.trim() || person?.username || 'Diyetisyen',
      newInviteKey: generateInviteKey(),
      now,
    });
    if (!result.ok) {
      throw invalidCode();
    }

    return { profile: result.profile, membership: result.membership };
  }
}

function invalidCode(): NotFoundError {
  return new NotFoundError('ACTIVATION_CODE_INVALID', 'Activation code is invalid or expired');
}
