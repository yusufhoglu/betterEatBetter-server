import type {
  ActivationCode,
  ClientLink,
  ConsentScope,
  DataAccessLogEntry,
  DietitianNote,
  DietitianProfile,
  Organization,
  OrganizationMembership,
  OrganizationRole,
  PersonSummary,
} from '../domain/practiceTypes';
import type { Alert } from '../domain/alertRules';
import type { ScorePart } from '../domain/analytics';

export interface ClientInsight {
  linkId: string;
  score: number | null;
  scoreParts: ScorePart[];
  alerts: Alert[];
  computedAt: Date;
}

export interface MembershipWithOrganization extends OrganizationMembership {
  organization: Organization;
}

export interface RedeemActivationCodeInput {
  codeId: string;
  userId: string;
  /** Code's target organization; null → a fresh 'solo' organization named `soloOrganizationName`. */
  organizationId: string | null;
  orgRole: OrganizationRole;
  soloOrganizationName: string;
  newInviteKey: string;
  now: Date;
}

export type RedeemActivationCodeResult =
  | { ok: true; membership: MembershipWithOrganization; profile: DietitianProfile }
  | { ok: false; reason: 'EXHAUSTED' };

export interface CreateLinkInput {
  organizationId: string;
  dietitianId: string;
  clientId: string;
  consentScopes: ConsentScope[];
  now: Date;
}

export interface UpdateDietitianProfileInput {
  title?: string | null;
  licenseNo?: string | null;
  bio?: string | null;
  specialties?: string[];
}

/**
 * Persistence for the whole practice module (organizations, memberships,
 * dietitian profiles, activation codes, client links, notes, access log).
 */
export interface PracticeRepositoryPort {
  // dietitians & organizations
  findDietitianProfile(userId: string): Promise<DietitianProfile | null>;
  updateDietitianProfile(userId: string, patch: UpdateDietitianProfileInput): Promise<DietitianProfile>;
  listActiveMemberships(userId: string): Promise<MembershipWithOrganization[]>;
  findActiveMembership(organizationId: string, userId: string): Promise<MembershipWithOrganization | null>;
  findActiveMembershipByInviteKey(inviteKey: string): Promise<MembershipWithOrganization | null>;
  setInviteKey(organizationId: string, userId: string, inviteKey: string): Promise<void>;
  listOrganizationMembers(organizationId: string): Promise<Array<OrganizationMembership & { person: PersonSummary }>>;

  // activation codes
  findActivationCodeByHash(codeHash: string): Promise<ActivationCode | null>;
  /** Atomically consumes one use of the code and grants the dietitian profile + membership. */
  redeemActivationCode(input: RedeemActivationCodeInput): Promise<RedeemActivationCodeResult>;

  // client links
  findLinkById(linkId: string): Promise<ClientLink | null>;
  findActiveLinkForClient(clientId: string): Promise<ClientLink | null>;
  listActiveLinksForDietitian(dietitianId: string, organizationId?: string): Promise<ClientLink[]>;
  listActiveLinksForOrganization(organizationId: string): Promise<ClientLink[]>;
  /** Throws ConflictError('CLIENT_ALREADY_LINKED') when the client already has an active link. */
  createLink(input: CreateLinkInput): Promise<ClientLink>;
  updateConsent(linkId: string, scopes: ConsentScope[], now: Date): Promise<ClientLink>;
  endLink(linkId: string, endedBy: string, now: Date): Promise<ClientLink>;
  reassignLink(linkId: string, dietitianId: string): Promise<ClientLink>;
  /** Platform-admin move: the link follows the new dietitian into their organization. */
  moveLink(linkId: string, dietitianId: string, organizationId: string): Promise<ClientLink>;

  // notes (dietitian-private)
  listNotes(linkId: string): Promise<DietitianNote[]>;
  findNote(noteId: string): Promise<DietitianNote | null>;
  createNote(linkId: string, authorId: string, body: string): Promise<DietitianNote>;
  updateNote(noteId: string, body: string): Promise<DietitianNote>;
  deleteNote(noteId: string): Promise<void>;

  /** Every active link, for the nightly insights job. */
  listAllActiveLinks(): Promise<ClientLink[]>;

  // alerts & insights
  listAlertRuleSettings(dietitianId: string): Promise<Array<{ ruleId: string; enabled: boolean; threshold: number | null }>>;
  saveAlertRuleSettings(
    dietitianId: string,
    settings: Array<{ ruleId: string; enabled: boolean; threshold: number | null }>,
  ): Promise<void>;
  saveInsight(insight: ClientInsight): Promise<void>;
  getInsights(linkIds: string[]): Promise<Map<string, ClientInsight>>;

  // audit
  appendAccessLog(entry: Omit<DataAccessLogEntry, 'id' | 'createdAt'>): Promise<void>;
  listAccessLog(subjectId: string, limit: number, before?: Date): Promise<DataAccessLogEntry[]>;

  // people (read-only projection of identity's users table)
  getPeople(userIds: string[]): Promise<Map<string, PersonSummary>>;
}
