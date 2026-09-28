import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import {
  encodeInviteCode,
  MAX_INVITE_VALIDITY_DAYS,
  MIN_INVITE_VALIDITY_DAYS,
  type IssuedInviteCode,
} from '../domain/inviteCode';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { requireMembership } from './requireMembership';

export interface CreateInviteCodeInput {
  dietitianId: string;
  organizationId?: string;
  validityDays?: number;
}

/**
 * Issues a stateless invite code for the caller's membership. Nothing is
 * written — the code carries the membership's inviteKey and its expiry.
 */
export class CreateInviteCode {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly secret: string,
    private readonly defaultValidityDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: CreateInviteCodeInput): Promise<IssuedInviteCode & { organizationId: string }> {
    const validityDays = input.validityDays ?? this.defaultValidityDays;
    if (validityDays < MIN_INVITE_VALIDITY_DAYS || validityDays > MAX_INVITE_VALIDITY_DAYS) {
      throw new ValidationError('INVALID_VALIDITY_DAYS', 'validityDays is out of range');
    }

    const [membership, profile] = await Promise.all([
      requireMembership(this.repository, input.dietitianId, input.organizationId),
      this.repository.findDietitianProfile(input.dietitianId),
    ]);
    if (!profile) {
      throw new NotFoundError('NOT_A_DIETITIAN', 'This account is not a dietitian');
    }

    const issued = encodeInviteCode(membership.inviteKey, validityDays, this.secret, this.now());
    return { ...issued, organizationId: membership.organizationId };
  }
}
