import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import type { AdminRepositoryPort } from '../ports/AdminRepositoryPort';

export const NOT_PLATFORM_ADMIN = 'NOT_PLATFORM_ADMIN';

/** Platform admins are listed by email in PLATFORM_ADMIN_EMAILS (case-insensitive). */
export class AdminAccessPolicy {
  private readonly emails: ReadonlySet<string>;

  constructor(
    private readonly repository: Pick<AdminRepositoryPort, 'findUserEmail'>,
    adminEmails: readonly string[],
  ) {
    this.emails = new Set(adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  }

  async isAdmin(userId: string): Promise<boolean> {
    if (this.emails.size === 0) {
      return false;
    }
    const email = await this.repository.findUserEmail(userId);
    return email !== null && this.emails.has(email.toLowerCase());
  }

  async assertAdmin(userId: string): Promise<void> {
    if (!(await this.isAdmin(userId))) {
      throw new ForbiddenError(NOT_PLATFORM_ADMIN, 'Platform admin access required');
    }
  }
}
