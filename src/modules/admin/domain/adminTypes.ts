/**
 * Platform-admin read models. Deliberately summary-level: counts, dates and
 * AI usage — never meal contents, weights or other health data (admin-rule.md).
 */

export interface PersonRef {
  userId: string;
  name: string | null;
  email: string;
}

export interface AiFeatureUsage {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DailyCount {
  date: string; // YYYY-MM-DD (UTC)
  value: number;
}

export interface AdminOverview {
  users: { total: number; new7: number; new30: number; active7: number; active30: number; suspended: number };
  premium: { active: number };
  dietitians: { total: number; suspended: number; linkedClients: number };
  ai: {
    windowDays: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    byFeature: AiFeatureUsage[];
    dailyTokens: DailyCount[];
    photoScans: number;
    dailyPhotoScans: DailyCount[];
  };
  signupsDaily: DailyCount[];
}

export type UserFilter = 'all' | 'premium' | 'suspended' | 'dietitians' | 'with_dietitian' | 'without_dietitian';

export interface AdminUserRow {
  userId: string;
  email: string;
  name: string | null;
  username: string | null;
  createdAt: Date;
  suspendedAt: Date | null;
  isPremium: boolean;
  isDietitian: boolean;
  dietitian: PersonRef | null;
  lastActiveAt: Date | null;
  aiTokens30: number;
  photoScans30: number;
}

export interface AdminUserDetail extends AdminUserRow {
  suspendedReason: string | null;
  signInMethods: { password: boolean; google: boolean };
  subscription: {
    isPremium: boolean;
    productId: string | null;
    provider: string | null;
    expiresAt: Date | null;
    /** True when premium comes from an admin grant (revocable here). */
    adminGranted: boolean;
  };
  dietitianSince: Date | null;
  linkSince: Date | null;
  activity: {
    mealDays7: number;
    mealDays30: number;
    waterDays30: number;
    stepDays30: number;
    weighIns30: number;
    coachMessages30: number;
    chatMessages30: number;
  };
  ai: { byFeature: AiFeatureUsage[]; dailyTokens: DailyCount[] };
  photoScans: { total30: number; failed30: number; allTime: number };
}

export interface AdminDietitianRow {
  userId: string;
  email: string;
  name: string | null;
  title: string | null;
  verifiedAt: Date;
  organization: { id: string; name: string; kind: string } | null;
  status: 'active' | 'suspended';
  activeClients: number;
  activationCodeNote: string | null;
  lastActiveAt: Date | null;
}

export interface AdminDietitianClient {
  clientId: string;
  email: string;
  name: string | null;
  since: Date;
  score: number | null;
  lastLoggedDate: string | null;
}

export interface AdminDietitianDetail extends AdminDietitianRow {
  licenseNo: string | null;
  clients: AdminDietitianClient[];
}

export type ActivationCodeStatus = 'active' | 'used_up' | 'expired' | 'revoked';

export interface AdminActivationCode {
  id: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  status: ActivationCodeStatus;
  organization: { id: string; name: string } | null;
  redeemedBy: PersonRef[];
}

export interface AdminAuditEntry {
  id: string;
  admin: PersonRef | null;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

export function activationCodeStatus(
  code: { maxUses: number; usedCount: number; expiresAt: Date | null; revokedAt: Date | null },
  now: Date,
): ActivationCodeStatus {
  if (code.revokedAt) return 'revoked';
  if (code.usedCount >= code.maxUses) return 'used_up';
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}
