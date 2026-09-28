import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { AdminRepositoryPort, EntitlementCachePort } from '../ports/AdminRepositoryPort';

export class ManageUsers {
  constructor(
    private readonly repository: AdminRepositoryPort,
    private readonly entitlements: EntitlementCachePort,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async suspend(adminId: string, userId: string, reason: string | null): Promise<void> {
    if (adminId === userId) {
      throw new ValidationError('CANNOT_SUSPEND_SELF', 'You cannot suspend your own account');
    }
    await this.mustExist(userId);
    await this.repository.suspendUser(userId, reason, this.clock());
    await this.repository.appendAudit({ adminId, action: 'user.suspend', targetType: 'user', targetId: userId, details: reason ? { reason } : undefined });
  }

  async unsuspend(adminId: string, userId: string): Promise<void> {
    await this.mustExist(userId);
    await this.repository.unsuspendUser(userId);
    await this.repository.appendAudit({ adminId, action: 'user.unsuspend', targetType: 'user', targetId: userId });
  }

  async setPremium(adminId: string, userId: string, grant: boolean): Promise<void> {
    await this.mustExist(userId);
    if (grant) {
      await this.repository.grantPremium(userId);
    } else {
      await this.repository.revokePremium(userId);
    }
    await this.entitlements.invalidate(userId);
    await this.repository.appendAudit({ adminId, action: grant ? 'premium.grant' : 'premium.revoke', targetType: 'user', targetId: userId });
  }

  private async mustExist(userId: string): Promise<void> {
    if (!(await this.repository.userExists(userId))) {
      throw new NotFoundError('USER_NOT_FOUND', 'User not found');
    }
  }
}
