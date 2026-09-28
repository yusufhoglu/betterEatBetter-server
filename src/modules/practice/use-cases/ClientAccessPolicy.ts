import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { createModuleLogger } from '../../../shared/observability/logger';
import { canManageOrganization, type ClientLink, type ConsentScope } from '../domain/practiceTypes';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

const logger = createModuleLogger('practice');

export interface StaffAccess {
  link: ClientLink;
  /** The actor is the link's assigned dietitian (vs. an org owner/admin). */
  isAssigned: boolean;
  canManage: boolean;
}

/**
 * The single gate in front of every dietitian-side read of client data
 * (KVKK: health data is a special category). Rules:
 *   - there must be an ACTIVE link for the client;
 *   - roster/metadata: the assigned dietitian or an owner/admin of the link's organization;
 *   - actual data: ONLY the assigned dietitian, and only for scopes the client shares now.
 * An actor with no business seeing the client gets 404 — existence is not leaked.
 * Every data read is appended to the client's access log.
 */
export class ClientAccessPolicy {
  constructor(private readonly repository: PracticeRepositoryPort) {}

  async resolveStaffAccess(actorId: string, clientId: string): Promise<StaffAccess> {
    const link = await this.repository.findActiveLinkForClient(clientId);
    if (!link) {
      throw notFound();
    }

    const isAssigned = link.dietitianId === actorId;
    const membership = await this.repository.findActiveMembership(link.organizationId, actorId);
    const canManage = membership !== null && canManageOrganization(membership.role);

    if (!isAssigned && !canManage) {
      throw notFound();
    }

    return { link, isAssigned, canManage };
  }

  /** Assigned dietitian only — for writes such as plan targets. */
  async assertAssigned(actorId: string, clientId: string): Promise<ClientLink> {
    const access = await this.resolveStaffAccess(actorId, clientId);
    if (!access.isAssigned) {
      throw new ForbiddenError('NOT_ASSIGNED_DIETITIAN', 'Only the assigned dietitian can do this');
    }
    return access.link;
  }

  async assertCanRead(actorId: string, clientId: string, scope: ConsentScope, resource: string): Promise<ClientLink> {
    const link = await this.assertAssigned(actorId, clientId);
    if (!link.consentScopes.includes(scope)) {
      throw new ForbiddenError('CONSENT_SCOPE_DISABLED', `The client does not share ${scope}`);
    }

    this.log(actorId, clientId, scope, resource);
    return link;
  }

  /** Audit without blocking the request — a failed log write must not fail the read. */
  log(actorId: string, clientId: string, scope: string, resource: string): void {
    this.repository.appendAccessLog({ actorId, subjectId: clientId, scope, resource }).catch((err: unknown) => {
      logger.error({ err, actorId, clientId, scope }, 'failed to append data access log');
    });
  }
}

function notFound(): NotFoundError {
  return new NotFoundError('CLIENT_NOT_FOUND', 'Client not found');
}
