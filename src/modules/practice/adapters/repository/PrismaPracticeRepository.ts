import { Prisma, type PrismaClient } from '@prisma/client';
import { ConflictError } from '../../../../shared/errors/ConflictError';
import {
  isConsentScope,
  type ActivationCode,
  type ClientLink,
  type ConsentScope,
  type DataAccessLogEntry,
  type DietitianNote,
  type DietitianProfile,
  type Organization,
  type OrganizationMembership,
  type OrganizationRole,
  type PersonSummary,
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

type OrganizationRow = Prisma.OrganizationGetPayload<object>;
type MemberRow = Prisma.OrganizationMemberGetPayload<{ include: { organization: true } }>;
type LinkRow = Prisma.DietitianClientLinkGetPayload<object>;
type ProfileRow = Prisma.DietitianProfileGetPayload<object>;

const ONE_ACTIVE_LINK_INDEX = 'dietitian_client_links_one_active_per_client';

function toOrganization(row: OrganizationRow): Organization {
  return { id: row.id, name: row.name, kind: row.kind as Organization['kind'], createdAt: row.createdAt };
}

function toMembership(row: MemberRow): MembershipWithOrganization {
  return {
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role as OrganizationRole,
    status: row.status as OrganizationMembership['status'],
    inviteKey: row.inviteKey,
    joinedAt: row.joinedAt,
    organization: toOrganization(row.organization),
  };
}

function toProfile(row: ProfileRow): DietitianProfile {
  return {
    userId: row.userId,
    title: row.title,
    licenseNo: row.licenseNo,
    bio: row.bio,
    specialties: row.specialties,
    verifiedAt: row.verifiedAt,
  };
}

function toLink(row: LinkRow): ClientLink {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dietitianId: row.dietitianId,
    clientId: row.clientId,
    status: row.status as ClientLink['status'],
    consentScopes: row.consentScopes.filter(isConsentScope),
    consentUpdatedAt: row.consentUpdatedAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    endedBy: row.endedBy,
  };
}

function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export class PrismaPracticeRepository implements PracticeRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  // ─── dietitians & organizations ────────────────────────────────────────

  async findDietitianProfile(userId: string): Promise<DietitianProfile | null> {
    const row = await this.db.dietitianProfile.findUnique({ where: { userId } });
    return row ? toProfile(row) : null;
  }

  async updateDietitianProfile(userId: string, patch: UpdateDietitianProfileInput): Promise<DietitianProfile> {
    return toProfile(await this.db.dietitianProfile.update({ where: { userId }, data: patch }));
  }

  async listActiveMemberships(userId: string): Promise<MembershipWithOrganization[]> {
    const rows = await this.db.organizationMember.findMany({
      where: { userId, status: 'active' },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toMembership);
  }

  async findActiveMembership(organizationId: string, userId: string): Promise<MembershipWithOrganization | null> {
    const row = await this.db.organizationMember.findFirst({
      where: { organizationId, userId, status: 'active' },
      include: { organization: true },
    });
    return row ? toMembership(row) : null;
  }

  async findActiveMembershipByInviteKey(inviteKey: string): Promise<MembershipWithOrganization | null> {
    const row = await this.db.organizationMember.findFirst({
      where: { inviteKey, status: 'active' },
      include: { organization: true },
    });
    return row ? toMembership(row) : null;
  }

  async setInviteKey(organizationId: string, userId: string, inviteKey: string): Promise<void> {
    await this.db.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { inviteKey },
    });
  }

  async listOrganizationMembers(
    organizationId: string,
  ): Promise<Array<OrganizationMembership & { person: PersonSummary }>> {
    const rows = await this.db.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, username: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      userId: row.userId,
      role: row.role as OrganizationRole,
      status: row.status as OrganizationMembership['status'],
      inviteKey: row.inviteKey,
      joinedAt: row.joinedAt,
      person: { userId: row.user.id, name: row.user.name, username: row.user.username, avatarUrl: row.user.avatarUrl },
    }));
  }

  // ─── activation codes ──────────────────────────────────────────────────

  async findActivationCodeByHash(codeHash: string): Promise<ActivationCode | null> {
    const row = await this.db.dietitianActivationCode.findUnique({ where: { codeHash } });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      orgRole: row.orgRole as OrganizationRole,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  async redeemActivationCode(input: RedeemActivationCodeInput): Promise<RedeemActivationCodeResult> {
    return this.db.$transaction(async (tx) => {
      // Conditional increment: two concurrent redemptions of the last use cannot both win.
      const consumed = await tx.$executeRaw`
        UPDATE "dietitian_activation_codes"
        SET "usedCount" = "usedCount" + 1
        WHERE "id" = ${input.codeId}
          AND "usedCount" < "maxUses"
          AND "revokedAt" IS NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > ${input.now})`;
      if (consumed === 0) {
        return { ok: false as const, reason: 'EXHAUSTED' as const };
      }

      const organizationId =
        input.organizationId ??
        (await tx.organization.create({ data: { name: input.soloOrganizationName, kind: 'solo' } })).id;

      const profile = await tx.dietitianProfile.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, activationCodeId: input.codeId, verifiedAt: input.now },
        update: {},
      });

      const membership = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: input.userId } },
        create: {
          organizationId,
          userId: input.userId,
          role: input.orgRole,
          inviteKey: input.newInviteKey,
          joinedAt: input.now,
        },
        update: { role: input.orgRole, status: 'active', inviteKey: input.newInviteKey, joinedAt: input.now },
        include: { organization: true },
      });

      return { ok: true as const, profile: toProfile(profile), membership: toMembership(membership) };
    });
  }

  // ─── client links ──────────────────────────────────────────────────────

  async findLinkById(linkId: string): Promise<ClientLink | null> {
    const row = await this.db.dietitianClientLink.findUnique({ where: { id: linkId } });
    return row ? toLink(row) : null;
  }

  async findActiveLinkForClient(clientId: string): Promise<ClientLink | null> {
    const row = await this.db.dietitianClientLink.findFirst({ where: { clientId, status: 'active' } });
    return row ? toLink(row) : null;
  }

  async listActiveLinksForDietitian(dietitianId: string, organizationId?: string): Promise<ClientLink[]> {
    const rows = await this.db.dietitianClientLink.findMany({
      where: { dietitianId, status: 'active', ...(organizationId ? { organizationId } : {}) },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(toLink);
  }

  async listActiveLinksForOrganization(organizationId: string): Promise<ClientLink[]> {
    const rows = await this.db.dietitianClientLink.findMany({
      where: { organizationId, status: 'active' },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(toLink);
  }

  async createLink(input: CreateLinkInput): Promise<ClientLink> {
    try {
      const row = await this.db.dietitianClientLink.create({
        data: {
          organizationId: input.organizationId,
          dietitianId: input.dietitianId,
          clientId: input.clientId,
          status: 'active',
          consentScopes: input.consentScopes,
          consentUpdatedAt: input.now,
          startedAt: input.now,
        },
      });
      return toLink(row);
    } catch (err) {
      // The partial unique index is invisible to Prisma's schema, so match on
      // the P2002 itself rather than on a named target.
      if (isUniqueViolation(err) || String(err).includes(ONE_ACTIVE_LINK_INDEX)) {
        throw new ConflictError('CLIENT_ALREADY_LINKED', 'You already have an active dietitian');
      }
      throw err;
    }
  }

  async updateConsent(linkId: string, scopes: ConsentScope[], now: Date): Promise<ClientLink> {
    return toLink(
      await this.db.dietitianClientLink.update({
        where: { id: linkId },
        data: { consentScopes: scopes, consentUpdatedAt: now },
      }),
    );
  }

  async endLink(linkId: string, endedBy: string, now: Date): Promise<ClientLink> {
    return toLink(
      await this.db.dietitianClientLink.update({
        where: { id: linkId },
        data: { status: 'ended', endedAt: now, endedBy },
      }),
    );
  }

  async reassignLink(linkId: string, dietitianId: string): Promise<ClientLink> {
    return toLink(await this.db.dietitianClientLink.update({ where: { id: linkId }, data: { dietitianId } }));
  }

  async listAllActiveLinks(): Promise<ClientLink[]> {
    const rows = await this.db.dietitianClientLink.findMany({ where: { status: 'active' } });
    return rows.map(toLink);
  }

  // ─── alerts & insights ─────────────────────────────────────────────────

  async listAlertRuleSettings(dietitianId: string): Promise<Array<{ ruleId: string; enabled: boolean; threshold: number | null }>> {
    return this.db.alertRuleSetting.findMany({
      where: { dietitianId },
      select: { ruleId: true, enabled: true, threshold: true },
    });
  }

  async saveAlertRuleSettings(
    dietitianId: string,
    settings: Array<{ ruleId: string; enabled: boolean; threshold: number | null }>,
  ): Promise<void> {
    await this.db.$transaction(
      settings.map((s) =>
        this.db.alertRuleSetting.upsert({
          where: { dietitianId_ruleId: { dietitianId, ruleId: s.ruleId } },
          create: { dietitianId, ruleId: s.ruleId, enabled: s.enabled, threshold: s.threshold },
          update: { enabled: s.enabled, threshold: s.threshold },
        }),
      ),
    );
  }

  async saveInsight(insight: ClientInsight): Promise<void> {
    const data = {
      score: insight.score,
      scoreParts: insight.scoreParts as unknown as Prisma.InputJsonValue,
      alerts: insight.alerts as unknown as Prisma.InputJsonValue,
      computedAt: insight.computedAt,
    };
    await this.db.clientInsight.upsert({
      where: { linkId: insight.linkId },
      create: { linkId: insight.linkId, ...data },
      update: data,
    });
  }

  async getInsights(linkIds: string[]): Promise<Map<string, ClientInsight>> {
    if (linkIds.length === 0) {
      return new Map();
    }
    const rows = await this.db.clientInsight.findMany({ where: { linkId: { in: linkIds } } });
    return new Map(
      rows.map((row) => [
        row.linkId,
        {
          linkId: row.linkId,
          score: row.score,
          scoreParts: row.scoreParts as unknown as ClientInsight['scoreParts'],
          alerts: row.alerts as unknown as ClientInsight['alerts'],
          computedAt: row.computedAt,
        },
      ]),
    );
  }

  // ─── notes ─────────────────────────────────────────────────────────────

  async listNotes(linkId: string): Promise<DietitianNote[]> {
    return this.db.dietitianNote.findMany({ where: { linkId }, orderBy: { createdAt: 'desc' } });
  }

  async findNote(noteId: string): Promise<DietitianNote | null> {
    return this.db.dietitianNote.findUnique({ where: { id: noteId } });
  }

  async createNote(linkId: string, authorId: string, body: string): Promise<DietitianNote> {
    return this.db.dietitianNote.create({ data: { linkId, authorId, body } });
  }

  async updateNote(noteId: string, body: string): Promise<DietitianNote> {
    return this.db.dietitianNote.update({ where: { id: noteId }, data: { body } });
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.db.dietitianNote.delete({ where: { id: noteId } });
  }

  // ─── audit ─────────────────────────────────────────────────────────────

  async appendAccessLog(entry: Omit<DataAccessLogEntry, 'id' | 'createdAt'>): Promise<void> {
    await this.db.dataAccessLog.create({ data: entry });
  }

  async listAccessLog(subjectId: string, limit: number, before?: Date): Promise<DataAccessLogEntry[]> {
    return this.db.dataAccessLog.findMany({
      where: { subjectId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── people ────────────────────────────────────────────────────────────

  async getPeople(userIds: string[]): Promise<Map<string, PersonSummary>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const rows = await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true, avatarUrl: true },
    });
    return new Map(
      rows.map((row) => [row.id, { userId: row.id, name: row.name, username: row.username, avatarUrl: row.avatarUrl }]),
    );
  }
}
