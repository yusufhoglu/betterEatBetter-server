/**
 * Data a client shares with their dietitian. The client toggles each scope on
 * or off at any time; the dietitian only ever sees scopes that are on *now*.
 */
export const CONSENT_SCOPES = ['meals', 'meal_photos', 'body_measurements', 'water'] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export function isConsentScope(value: string): value is ConsentScope {
  return (CONSENT_SCOPES as readonly string[]).includes(value);
}

export const ORGANIZATION_ROLES = ['owner', 'admin', 'dietitian'] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export function isOrganizationRole(value: string): value is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(value);
}

/** owner/admin can see the organization's client roster and reassign clients. */
export function canManageOrganization(role: OrganizationRole): boolean {
  return role === 'owner' || role === 'admin';
}

export type OrganizationKind = 'clinic' | 'solo';
export type LinkStatus = 'active' | 'ended';

export interface Organization {
  id: string;
  name: string;
  kind: OrganizationKind;
  createdAt: Date;
}

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: 'active' | 'removed';
  inviteKey: string;
  joinedAt: Date;
}

export interface DietitianProfile {
  userId: string;
  title: string | null;
  licenseNo: string | null;
  bio: string | null;
  specialties: string[];
  verifiedAt: Date;
}

export interface ActivationCode {
  id: string;
  organizationId: string | null;
  orgRole: OrganizationRole;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ClientLink {
  id: string;
  organizationId: string;
  dietitianId: string;
  clientId: string;
  status: LinkStatus;
  consentScopes: ConsentScope[];
  consentUpdatedAt: Date;
  startedAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}

export interface DietitianNote {
  id: string;
  linkId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataAccessLogEntry {
  id: string;
  actorId: string;
  subjectId: string;
  scope: string;
  resource: string;
  createdAt: Date;
}

/** Public identity of a user as the other side of a link sees it. */
export interface PersonSummary {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}
