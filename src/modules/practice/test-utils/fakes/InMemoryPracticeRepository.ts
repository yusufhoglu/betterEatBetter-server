import { randomUUID } from 'node:crypto';
import { ConflictError } from '../../../../shared/errors/ConflictError';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type {
  ActivationCode,
  ClientLink,
  ConsentScope,
  DataAccessLogEntry,
  DietitianNote,
  DietitianProfile,
  Organization,
  OrganizationMembership,
  PersonSummary,
} from '../../domain/practiceTypes';
import type {
  ClientInsight,
  CreateLinkInput,
  MembershipWithOrganization,
  PracticeRepositoryPort,
  RedeemActivationCodeInput,
  RedeemActivationCodeResult,
  UpdateDietitianProfileInput,
} from '../../ports/PracticeRepositoryPort';

export class InMemoryPracticeRepository implements PracticeRepositoryPort {
  readonly organizations = new Map<string, Organization>();
  readonly memberships: OrganizationMembership[] = [];
  readonly profiles = new Map<string, DietitianProfile>();
  readonly codes = new Map<string, ActivationCode & { codeHash: string }>();
  readonly links: ClientLink[] = [];
  readonly notes: DietitianNote[] = [];
  readonly accessLog: DataAccessLogEntry[] = [];
  readonly people = new Map<string, PersonSummary>();

  // ─── test helpers ──────────────────────────────────────────────────────
  addPerson(userId: string, name: string | null = userId): void {
    this.people.set(userId, { userId, name, username: null, avatarUrl: null });
  }

  addOrganization(org: Partial<Organization> & { id: string }): Organization {
    const full: Organization = { name: org.id, kind: 'clinic', createdAt: new Date(), ...org };
    this.organizations.set(full.id, full);
    return full;
  }

  addDietitian(userId: string, organizationId: string, role: OrganizationMembership['role'], inviteKey: string): void {
    if (!this.organizations.has(organizationId)) {
      this.addOrganization({ id: organizationId });
    }
    this.profiles.set(userId, {
      userId,
      title: null,
      licenseNo: null,
      bio: null,
      specialties: [],
      verifiedAt: new Date(),
    });
    this.memberships.push({ organizationId, userId, role, status: 'active', inviteKey, joinedAt: new Date() });
  }

  addCode(code: Partial<ActivationCode> & { id: string; codeHash: string }): void {
    this.codes.set(code.codeHash, {
      organizationId: null,
      orgRole: 'dietitian',
      maxUses: 1,
      usedCount: 0,
      expiresAt: null,
      revokedAt: null,
      ...code,
    });
  }

  private withOrg(m: OrganizationMembership): MembershipWithOrganization {
    return { ...m, organization: this.organizations.get(m.organizationId)! };
  }

  // ─── dietitians & organizations ────────────────────────────────────────
  async findDietitianProfile(userId: string): Promise<DietitianProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async updateDietitianProfile(userId: string, patch: UpdateDietitianProfileInput): Promise<DietitianProfile> {
    const existing = this.profiles.get(userId)!;
    const updated = { ...existing, ...patch };
    this.profiles.set(userId, updated);
    return updated;
  }

  async listActiveMemberships(userId: string): Promise<MembershipWithOrganization[]> {
    return this.memberships.filter((m) => m.userId === userId && m.status === 'active').map((m) => this.withOrg(m));
  }

  async findActiveMembership(organizationId: string, userId: string): Promise<MembershipWithOrganization | null> {
    const m = this.memberships.find(
      (x) => x.organizationId === organizationId && x.userId === userId && x.status === 'active',
    );
    return m ? this.withOrg(m) : null;
  }

  async findActiveMembershipByInviteKey(inviteKey: string): Promise<MembershipWithOrganization | null> {
    const m = this.memberships.find((x) => x.inviteKey === inviteKey && x.status === 'active');
    return m ? this.withOrg(m) : null;
  }

  async setInviteKey(organizationId: string, userId: string, inviteKey: string): Promise<void> {
    const m = this.memberships.find((x) => x.organizationId === organizationId && x.userId === userId);
    if (m) {
      m.inviteKey = inviteKey;
    }
  }

  async listOrganizationMembers(organizationId: string) {
    return this.memberships
      .filter((m) => m.organizationId === organizationId)
      .map((m) => ({ ...m, person: this.people.get(m.userId) ?? { userId: m.userId, name: null, username: null, avatarUrl: null } }));
  }

  // ─── activation codes ──────────────────────────────────────────────────
  async findActivationCodeByHash(codeHash: string): Promise<ActivationCode | null> {
    return this.codes.get(codeHash) ?? null;
  }

  async redeemActivationCode(input: RedeemActivationCodeInput): Promise<RedeemActivationCodeResult> {
    const code = [...this.codes.values()].find((c) => c.id === input.codeId)!;
    if (code.usedCount >= code.maxUses) {
      return { ok: false, reason: 'EXHAUSTED' };
    }
    code.usedCount += 1;

    let organizationId = input.organizationId;
    if (!organizationId) {
      organizationId = randomUUID();
      this.addOrganization({ id: organizationId, name: input.soloOrganizationName, kind: 'solo' });
    }
    const profile = this.profiles.get(input.userId) ?? {
      userId: input.userId,
      title: null,
      licenseNo: null,
      bio: null,
      specialties: [],
      verifiedAt: input.now,
    };
    this.profiles.set(input.userId, profile);
    const membership: OrganizationMembership = {
      organizationId,
      userId: input.userId,
      role: input.orgRole,
      status: 'active',
      inviteKey: input.newInviteKey,
      joinedAt: input.now,
    };
    this.memberships.push(membership);
    return { ok: true, profile, membership: this.withOrg(membership) };
  }

  // ─── client links ──────────────────────────────────────────────────────
  async findLinkById(linkId: string): Promise<ClientLink | null> {
    return this.links.find((l) => l.id === linkId) ?? null;
  }

  async findActiveLinkForClient(clientId: string): Promise<ClientLink | null> {
    const link = this.links.find((l) => l.clientId === clientId && l.status === 'active');
    return link ? { ...link } : null;
  }

  async listActiveLinksForDietitian(dietitianId: string, organizationId?: string): Promise<ClientLink[]> {
    return this.links.filter(
      (l) =>
        l.dietitianId === dietitianId && l.status === 'active' && (!organizationId || l.organizationId === organizationId),
    );
  }

  async listActiveLinksForOrganization(organizationId: string): Promise<ClientLink[]> {
    return this.links.filter((l) => l.organizationId === organizationId && l.status === 'active');
  }

  async createLink(input: CreateLinkInput): Promise<ClientLink> {
    if (await this.findActiveLinkForClient(input.clientId)) {
      throw new ConflictError('CLIENT_ALREADY_LINKED', 'already linked');
    }
    const link: ClientLink = {
      id: randomUUID(),
      organizationId: input.organizationId,
      dietitianId: input.dietitianId,
      clientId: input.clientId,
      status: 'active',
      consentScopes: input.consentScopes,
      consentUpdatedAt: input.now,
      startedAt: input.now,
      endedAt: null,
      endedBy: null,
    };
    this.links.push(link);
    return link;
  }

  private mustFindLink(linkId: string): ClientLink {
    const link = this.links.find((l) => l.id === linkId);
    if (!link) {
      throw new NotFoundError('LINK_NOT_FOUND', 'Link not found');
    }
    return link;
  }

  async updateConsent(linkId: string, scopes: ConsentScope[], now: Date): Promise<ClientLink> {
    const link = this.mustFindLink(linkId);
    link.consentScopes = scopes;
    link.consentUpdatedAt = now;
    return { ...link };
  }

  async endLink(linkId: string, endedBy: string, now: Date): Promise<ClientLink> {
    const link = this.mustFindLink(linkId);
    link.status = 'ended';
    link.endedAt = now;
    link.endedBy = endedBy;
    return { ...link };
  }

  async reassignLink(linkId: string, dietitianId: string): Promise<ClientLink> {
    const link = this.mustFindLink(linkId);
    link.dietitianId = dietitianId;
    return { ...link };
  }

  async moveLink(linkId: string, dietitianId: string, organizationId: string): Promise<ClientLink> {
    const link = this.mustFindLink(linkId);
    link.dietitianId = dietitianId;
    link.organizationId = organizationId;
    return { ...link };
  }

  async listAllActiveLinks(): Promise<ClientLink[]> {
    return this.links.filter((l) => l.status === 'active').map((l) => ({ ...l }));
  }

  // ─── alerts & insights ─────────────────────────────────────────────────
  readonly ruleSettings = new Map<string, Array<{ ruleId: string; enabled: boolean; threshold: number | null }>>();
  readonly insights = new Map<string, ClientInsight>();

  async listAlertRuleSettings(dietitianId: string) {
    return this.ruleSettings.get(dietitianId) ?? [];
  }

  async saveAlertRuleSettings(dietitianId: string, settings: Array<{ ruleId: string; enabled: boolean; threshold: number | null }>) {
    const current = new Map((this.ruleSettings.get(dietitianId) ?? []).map((s) => [s.ruleId, s]));
    for (const s of settings) current.set(s.ruleId, s);
    this.ruleSettings.set(dietitianId, [...current.values()]);
  }

  async saveInsight(insight: ClientInsight): Promise<void> {
    this.insights.set(insight.linkId, insight);
  }

  async getInsights(linkIds: string[]): Promise<Map<string, ClientInsight>> {
    return new Map(linkIds.filter((id) => this.insights.has(id)).map((id) => [id, this.insights.get(id)!]));
  }

  // ─── notes ─────────────────────────────────────────────────────────────
  async listNotes(linkId: string): Promise<DietitianNote[]> {
    return this.notes.filter((n) => n.linkId === linkId);
  }

  async findNote(noteId: string): Promise<DietitianNote | null> {
    return this.notes.find((n) => n.id === noteId) ?? null;
  }

  async createNote(linkId: string, authorId: string, body: string): Promise<DietitianNote> {
    const note = { id: randomUUID(), linkId, authorId, body, createdAt: new Date(), updatedAt: new Date() };
    this.notes.push(note);
    return note;
  }

  async updateNote(noteId: string, body: string): Promise<DietitianNote> {
    const note = this.notes.find((n) => n.id === noteId)!;
    note.body = body;
    note.updatedAt = new Date();
    return { ...note };
  }

  async deleteNote(noteId: string): Promise<void> {
    const index = this.notes.findIndex((n) => n.id === noteId);
    if (index >= 0) {
      this.notes.splice(index, 1);
    }
  }

  // ─── audit ─────────────────────────────────────────────────────────────
  async appendAccessLog(entry: Omit<DataAccessLogEntry, 'id' | 'createdAt'>): Promise<void> {
    this.accessLog.push({ ...entry, id: randomUUID(), createdAt: new Date() });
  }

  async listAccessLog(subjectId: string, limit: number, before?: Date): Promise<DataAccessLogEntry[]> {
    return this.accessLog
      .filter((e) => e.subjectId === subjectId && (!before || e.createdAt < before))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getPeople(userIds: string[]): Promise<Map<string, PersonSummary>> {
    return new Map(userIds.filter((id) => this.people.has(id)).map((id) => [id, this.people.get(id)!]));
  }
}
