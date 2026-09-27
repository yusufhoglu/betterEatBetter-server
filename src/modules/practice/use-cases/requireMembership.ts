import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { canManageOrganization } from '../domain/practiceTypes';
import type { MembershipWithOrganization, PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

/**
 * Resolves the caller's active membership — in `organizationId` when given,
 * otherwise their first (a solo dietitian has exactly one).
 */
export async function requireMembership(
  repository: PracticeRepositoryPort,
  userId: string,
  organizationId?: string,
): Promise<MembershipWithOrganization> {
  const membership = organizationId
    ? await repository.findActiveMembership(organizationId, userId)
    : ((await repository.listActiveMemberships(userId))[0] ?? null);
  if (!membership) {
    throw new NotFoundError('NOT_A_DIETITIAN', 'No active practice membership');
  }
  return membership;
}

export async function requireManager(
  repository: PracticeRepositoryPort,
  userId: string,
  organizationId: string,
): Promise<MembershipWithOrganization> {
  const membership = await requireMembership(repository, userId, organizationId);
  if (!canManageOrganization(membership.role)) {
    throw new ForbiddenError('ORGANIZATION_ADMIN_REQUIRED', 'Only organization owners and admins can do this');
  }
  return membership;
}
