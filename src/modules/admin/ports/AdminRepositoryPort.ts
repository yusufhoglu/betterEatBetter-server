import type {
  AdminActivationCode,
  AdminAuditEntry,
  AdminDietitianDetail,
  AdminDietitianRow,
  AdminOverview,
  AdminUserDetail,
  AdminUserRow,
  UserFilter,
} from '../domain/adminTypes';

export interface ListUsersInput {
  q?: string;
  filter: UserFilter;
  offset: number;
  limit: number;
}

export interface CreateActivationCodeRecord {
  codeHash: string;
  maxUses: number;
  expiresAt: Date | null;
  note: string | null;
}

export interface AuditInput {
  adminId: string;
  action: string;
  targetType: 'user' | 'dietitian' | 'activation_code' | 'client_link';
  targetId: string;
  details?: Record<string, unknown>;
}

/**
 * Cross-module read access and the few platform-level writes the admin panel
 * needs. Reads are aggregate/summary only (see adminTypes).
 */
export interface AdminRepositoryPort {
  findUserEmail(userId: string): Promise<string | null>;
  userExists(userId: string): Promise<boolean>;

  getOverview(now: Date, windowDays: number): Promise<AdminOverview>;
  listUsers(input: ListUsersInput, now: Date): Promise<{ items: AdminUserRow[]; total: number }>;
  getUser(userId: string, now: Date): Promise<AdminUserDetail | null>;
  listDietitians(q: string | undefined): Promise<AdminDietitianRow[]>;
  getDietitian(userId: string): Promise<AdminDietitianDetail | null>;
  listActivationCodes(now: Date): Promise<AdminActivationCode[]>;
  listAudit(limit: number, targetId?: string): Promise<AdminAuditEntry[]>;

  /** Sets suspendedAt and revokes every refresh token, in one transaction. */
  suspendUser(userId: string, reason: string | null, now: Date): Promise<void>;
  unsuspendUser(userId: string): Promise<void>;
  /** Upserts the manual `admin_grant` subscription (active, never expires). */
  grantPremium(userId: string): Promise<void>;
  /** Cancels the manual grant only; store subscriptions are untouched. */
  revokePremium(userId: string): Promise<void>;
  /** Flips every membership of the dietitian between 'active' and 'suspended'. Returns rows changed. */
  setDietitianSuspended(userId: string, suspended: boolean): Promise<number>;
  isDietitian(userId: string): Promise<boolean>;

  createActivationCode(record: CreateActivationCodeRecord): Promise<{ id: string }>;
  revokeActivationCode(id: string, now: Date): Promise<boolean>;

  appendAudit(entry: AuditInput): Promise<void>;
}

/** Clears cached premium entitlement after a grant/revoke so it applies at once. */
export interface EntitlementCachePort {
  invalidate(userId: string): Promise<void>;
}
