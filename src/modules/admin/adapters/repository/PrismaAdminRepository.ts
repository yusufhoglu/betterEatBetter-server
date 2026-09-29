import { Prisma, type PrismaClient } from '@prisma/client';
import {
  activationCodeStatus,
  type AdminActivationCode,
  type AdminAuditEntry,
  type AdminDietitianDetail,
  type AdminDietitianRow,
  type AdminOverview,
  type AdminUserDetail,
  type AdminUserRow,
  type AiFeatureUsage,
  type DailyCount,
  type UserFilter,
} from '../../domain/adminTypes';
import type {
  AdminRepositoryPort,
  AuditInput,
  CreateActivationCodeRecord,
  CreateUserRecord,
  ListUsersInput,
} from '../../ports/AdminRepositoryPort';

const GRANT_PRODUCT_ID = 'admin_grant';
const GRANT_PROVIDER = 'manual';
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (value: bigint | number | null | undefined): number => Number(value ?? 0);
const dayKey = (value: Date | string): string => (typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10));

/** Entitled subscription — mirrors subscription/domain/DetermineEntitlement. */
const premiumSql = (userCol: Prisma.Sql, now: Date) => Prisma.sql`EXISTS (
  SELECT 1 FROM subscriptions s WHERE s."userId" = ${userCol}
    AND s.status IN ('active', 'trialing') AND (s."expiresAt" IS NULL OR s."expiresAt" > ${now}))`;

/** Last sign of life: session refresh (app open), meal edit or AI call. */
const lastActiveSql = (userCol: Prisma.Sql) => Prisma.sql`GREATEST(
  (SELECT max(rt."createdAt") FROM refresh_tokens rt WHERE rt."userId" = ${userCol}),
  (SELECT max(mi."updatedAt") FROM meal_items mi WHERE mi."userId" = ${userCol}),
  (SELECT max(ae."createdAt") FROM ai_usage_events ae WHERE ae."userId" = ${userCol}))`;

interface UserRowRaw {
  userId: string;
  email: string;
  name: string | null;
  username: string | null;
  createdAt: Date;
  suspendedAt: Date | null;
  isPremium: boolean;
  isDietitian: boolean;
  dietitianId: string | null;
  dietitianName: string | null;
  dietitianEmail: string | null;
  lastActiveAt: Date | null;
  aiTokens30: bigint | null;
  photoScans30: bigint | null;
}

interface DietitianRowRaw {
  userId: string;
  email: string;
  name: string | null;
  title: string | null;
  licenseNo: string | null;
  verifiedAt: Date;
  orgId: string | null;
  orgName: string | null;
  orgKind: string | null;
  hasActive: boolean;
  activeClients: bigint;
  codeNote: string | null;
  lastActiveAt: Date | null;
}

export class PrismaAdminRepository implements AdminRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findUserEmail(userId: string): Promise<string | null> {
    return (await this.db.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null;
  }

  async emailExists(email: string): Promise<boolean> {
    return (await this.db.user.count({ where: { email: { equals: email, mode: 'insensitive' } } })) > 0;
  }

  async createUser(record: CreateUserRecord): Promise<{ userId: string }> {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: record.email, name: record.name, passwordHash: record.passwordHash },
        select: { id: true },
      });
      if (record.dietitian) {
        // Same shape ActivateDietitian creates from a solo activation code.
        const organization = await tx.organization.create({ data: { name: record.name, kind: 'solo' } });
        await tx.dietitianProfile.create({
          data: { userId: user.id, title: record.dietitian.title, licenseNo: record.dietitian.licenseNo, verifiedAt: record.now },
        });
        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: 'owner',
            inviteKey: record.dietitian.inviteKey,
            joinedAt: record.now,
          },
        });
      }
      if (record.premium) {
        await tx.subscription.create({
          data: {
            userId: user.id,
            productId: GRANT_PRODUCT_ID,
            provider: GRANT_PROVIDER,
            status: 'active',
            expiresAt: null,
            willRenew: false,
            inGracePeriod: false,
          },
        });
      }
      return { userId: user.id };
    });
  }

  async setPassword(userId: string, passwordHash: string | null, now: Date): Promise<void> {
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
  }

  async userExists(userId: string): Promise<boolean> {
    return (await this.db.user.count({ where: { id: userId } })) > 0;
  }

  // ─── overview ──────────────────────────────────────────────────────────
  async getOverview(now: Date, windowDays: number): Promise<AdminOverview> {
    const since7 = new Date(now.getTime() - 7 * DAY_MS);
    const since = new Date(now.getTime() - windowDays * DAY_MS);

    const [users] = await this.db.$queryRaw<Array<Record<string, bigint>>>`
      SELECT count(*) AS total,
        count(*) FILTER (WHERE "createdAt" >= ${since7}) AS new7,
        count(*) FILTER (WHERE "createdAt" >= ${since}) AS new30,
        count(*) FILTER (WHERE "suspendedAt" IS NOT NULL) AS suspended
      FROM users`;
    const [active] = await this.db.$queryRaw<Array<Record<string, bigint>>>`
      WITH activity AS (
        SELECT "userId", "createdAt" AS at FROM refresh_tokens WHERE "createdAt" >= ${since}
        UNION ALL SELECT "userId", "updatedAt" FROM meal_items WHERE "updatedAt" >= ${since}
        UNION ALL SELECT "userId", "createdAt" FROM ai_usage_events WHERE "createdAt" >= ${since} AND "userId" IS NOT NULL)
      SELECT count(DISTINCT "userId") FILTER (WHERE at >= ${since7}) AS active7, count(DISTINCT "userId") AS active30 FROM activity`;
    const [premium] = await this.db.$queryRaw<Array<{ active: bigint }>>`
      SELECT count(*) AS active FROM users u WHERE ${premiumSql(Prisma.sql`u.id`, now)}`;
    const [dietitians] = await this.db.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        (SELECT count(*) FROM dietitian_profiles) AS total,
        (SELECT count(*) FROM dietitian_profiles dp WHERE NOT EXISTS (
          SELECT 1 FROM organization_members om WHERE om."userId" = dp."userId" AND om.status = 'active')) AS suspended,
        (SELECT count(*) FROM dietitian_client_links WHERE status = 'active') AS linked`;

    const byFeature = await this.aiByFeature(Prisma.sql`TRUE`, since);
    const dailyTokens = await this.dailySeries(
      Prisma.sql`SELECT "createdAt" AS at, ("inputTokens" + "outputTokens") AS v FROM ai_usage_events`,
      since,
      now,
    );
    const dailyPhotoScans = await this.dailySeries(Prisma.sql`SELECT "createdAt" AS at, 1 AS v FROM food_entries`, since, now);
    const signupsDaily = await this.dailySeries(Prisma.sql`SELECT "createdAt" AS at, 1 AS v FROM users`, since, now);

    return {
      users: {
        total: num(users?.total),
        new7: num(users?.new7),
        new30: num(users?.new30),
        active7: num(active?.active7),
        active30: num(active?.active30),
        suspended: num(users?.suspended),
      },
      premium: { active: num(premium?.active) },
      dietitians: { total: num(dietitians?.total), suspended: num(dietitians?.suspended), linkedClients: num(dietitians?.linked) },
      ai: {
        windowDays,
        calls: byFeature.reduce((s, f) => s + f.calls, 0),
        inputTokens: byFeature.reduce((s, f) => s + f.inputTokens, 0),
        outputTokens: byFeature.reduce((s, f) => s + f.outputTokens, 0),
        byFeature,
        dailyTokens,
        photoScans: dailyPhotoScans.reduce((s, d) => s + d.value, 0),
        dailyPhotoScans,
      },
      signupsDaily,
    };
  }

  // ─── users ─────────────────────────────────────────────────────────────
  async listUsers(input: ListUsersInput, now: Date): Promise<{ items: AdminUserRow[]; total: number }> {
    const where = this.userWhere(input.q, input.filter, now);
    const [count] = await this.db.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM users u WHERE ${where}`;
    const rows = await this.userRows(where, now, Prisma.sql`ORDER BY u."createdAt" DESC LIMIT ${input.limit} OFFSET ${input.offset}`);
    return { items: rows, total: num(count?.total) };
  }

  async getUser(userId: string, now: Date): Promise<AdminUserDetail | null> {
    const [row] = await this.userRows(Prisma.sql`u.id = ${userId}`, now, Prisma.empty);
    if (!row) {
      return null;
    }
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const today = new Date(`${dayKey(now)}T00:00:00.000Z`);
    const day7 = new Date(today.getTime() - 6 * DAY_MS);
    const day30 = new Date(today.getTime() - 29 * DAY_MS);

    const [account, subscriptions, profile, link] = await Promise.all([
      this.db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, googleSub: true, suspendedReason: true } }),
      this.db.subscription.findMany({ where: { userId } }),
      this.db.dietitianProfile.findUnique({ where: { userId }, select: { verifiedAt: true } }),
      this.db.dietitianClientLink.findFirst({ where: { clientId: userId, status: 'active' }, select: { startedAt: true } }),
    ]);
    const [activity] = await this.db.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        (SELECT count(DISTINCT date) FROM meal_items WHERE "userId" = ${userId} AND date >= ${day7}) AS "mealDays7",
        (SELECT count(DISTINCT date) FROM meal_items WHERE "userId" = ${userId} AND date >= ${day30}) AS "mealDays30",
        (SELECT count(*) FROM water_logs WHERE "userId" = ${userId} AND date >= ${day30}) AS "waterDays30",
        (SELECT count(*) FROM step_logs WHERE "userId" = ${userId} AND date >= ${day30}) AS "stepDays30",
        (SELECT count(*) FROM body_measurements WHERE "userId" = ${userId} AND metric = 'weight' AND date >= ${day30}) AS "weighIns30",
        (SELECT count(*) FROM dietician_messages m JOIN dietician_conversations c ON c.id = m."conversationId"
          WHERE c."userId" = ${userId} AND m.role = 'user' AND m."createdAt" >= ${since}) AS "coachMessages30",
        (SELECT count(*) FROM messages m JOIN conversations c ON c.id = m."conversationId"
          WHERE c."userId" = ${userId} AND m.role = 'user' AND m."createdAt" >= ${since}) AS "chatMessages30",
        (SELECT count(*) FROM food_entries WHERE "userId" = ${userId} AND "createdAt" >= ${since}) AS "photos30",
        (SELECT count(*) FROM food_entries WHERE "userId" = ${userId} AND "createdAt" >= ${since} AND status = 'failed') AS "photosFailed30",
        (SELECT count(*) FROM food_entries WHERE "userId" = ${userId}) AS "photosAll"`;

    const entitled = subscriptions.filter(
      (s) => ['active', 'trialing'].includes(s.status) && (s.expiresAt === null || s.expiresAt.getTime() > now.getTime()),
    );
    const current = entitled.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;

    return {
      ...row,
      suspendedReason: account?.suspendedReason ?? null,
      signInMethods: { password: account?.passwordHash != null, google: account?.googleSub != null },
      subscription: {
        isPremium: current !== null,
        productId: current?.productId ?? null,
        provider: current?.provider ?? null,
        expiresAt: current?.expiresAt ?? null,
        adminGranted: entitled.some((s) => s.productId === GRANT_PRODUCT_ID && s.provider === GRANT_PROVIDER),
      },
      dietitianSince: profile?.verifiedAt ?? null,
      linkSince: link?.startedAt ?? null,
      activity: {
        mealDays7: num(activity?.mealDays7),
        mealDays30: num(activity?.mealDays30),
        waterDays30: num(activity?.waterDays30),
        stepDays30: num(activity?.stepDays30),
        weighIns30: num(activity?.weighIns30),
        coachMessages30: num(activity?.coachMessages30),
        chatMessages30: num(activity?.chatMessages30),
      },
      ai: {
        byFeature: await this.aiByFeature(Prisma.sql`"userId" = ${userId}`, since),
        dailyTokens: await this.dailySeries(
          Prisma.sql`SELECT "createdAt" AS at, ("inputTokens" + "outputTokens") AS v FROM ai_usage_events WHERE "userId" = ${userId}`,
          since,
          now,
        ),
      },
      photoScans: { total30: num(activity?.photos30), failed30: num(activity?.photosFailed30), allTime: num(activity?.photosAll) },
    };
  }

  private userWhere(q: string | undefined, filter: UserFilter, now: Date): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      parts.push(Prisma.sql`(u.email ILIKE ${like} OR u.name ILIKE ${like} OR u.username ILIKE ${like} OR u.id = ${q})`);
    }
    const isDietitian = Prisma.sql`EXISTS (SELECT 1 FROM dietitian_profiles dp WHERE dp."userId" = u.id)`;
    const hasDietitian = Prisma.sql`EXISTS (SELECT 1 FROM dietitian_client_links l WHERE l."clientId" = u.id AND l.status = 'active')`;
    switch (filter) {
      case 'premium':
        parts.push(premiumSql(Prisma.sql`u.id`, now));
        break;
      case 'suspended':
        parts.push(Prisma.sql`u."suspendedAt" IS NOT NULL`);
        break;
      case 'dietitians':
        parts.push(isDietitian);
        break;
      case 'with_dietitian':
        parts.push(hasDietitian);
        break;
      case 'without_dietitian':
        parts.push(Prisma.sql`NOT ${hasDietitian} AND NOT ${isDietitian}`);
        break;
      case 'all':
        break;
    }
    return Prisma.join(parts, ' AND ');
  }

  private async userRows(where: Prisma.Sql, now: Date, tail: Prisma.Sql): Promise<AdminUserRow[]> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const rows = await this.db.$queryRaw<UserRowRaw[]>`
      SELECT u.id AS "userId", u.email, u.name, u.username, u."createdAt", u."suspendedAt",
        ${premiumSql(Prisma.sql`u.id`, now)} AS "isPremium",
        EXISTS (SELECT 1 FROM dietitian_profiles dp WHERE dp."userId" = u.id) AS "isDietitian",
        d.id AS "dietitianId", d.name AS "dietitianName", d.email AS "dietitianEmail",
        ${lastActiveSql(Prisma.sql`u.id`)} AS "lastActiveAt",
        (SELECT sum("inputTokens" + "outputTokens") FROM ai_usage_events ae WHERE ae."userId" = u.id AND ae."createdAt" >= ${since}) AS "aiTokens30",
        (SELECT count(*) FROM food_entries fe WHERE fe."userId" = u.id AND fe."createdAt" >= ${since}) AS "photoScans30"
      FROM users u
      LEFT JOIN dietitian_client_links l ON l."clientId" = u.id AND l.status = 'active'
      LEFT JOIN users d ON d.id = l."dietitianId"
      WHERE ${where} ${tail}`;
    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      username: r.username,
      createdAt: r.createdAt,
      suspendedAt: r.suspendedAt,
      isPremium: r.isPremium,
      isDietitian: r.isDietitian,
      dietitian: r.dietitianId ? { userId: r.dietitianId, name: r.dietitianName, email: r.dietitianEmail ?? '' } : null,
      lastActiveAt: r.lastActiveAt,
      aiTokens30: num(r.aiTokens30),
      photoScans30: num(r.photoScans30),
    }));
  }

  // ─── dietitians ────────────────────────────────────────────────────────
  async listDietitians(q: string | undefined): Promise<AdminDietitianRow[]> {
    const where = q
      ? (() => {
          const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
          return Prisma.sql`(u.email ILIKE ${like} OR u.name ILIKE ${like} OR dp.title ILIKE ${like})`;
        })()
      : Prisma.sql`TRUE`;
    return (await this.dietitianRows(where)).map(toDietitianRow);
  }

  async getDietitian(userId: string): Promise<AdminDietitianDetail | null> {
    const [raw] = await this.dietitianRows(Prisma.sql`dp."userId" = ${userId}`);
    if (!raw) {
      return null;
    }
    const clients = await this.db.$queryRaw<
      Array<{ clientId: string; email: string; name: string | null; since: Date; score: number | null; lastLoggedDate: Date | null }>
    >`
      SELECT l."clientId", u.email, u.name, l."startedAt" AS since, ci.score,
        (SELECT max(mi.date) FROM meal_items mi WHERE mi."userId" = l."clientId") AS "lastLoggedDate"
      FROM dietitian_client_links l
      JOIN users u ON u.id = l."clientId"
      LEFT JOIN client_insights ci ON ci."linkId" = l.id
      WHERE l."dietitianId" = ${userId} AND l.status = 'active'
      ORDER BY l."startedAt" DESC`;
    return {
      ...toDietitianRow(raw),
      licenseNo: raw.licenseNo,
      clients: clients.map((c) => ({
        clientId: c.clientId,
        email: c.email,
        name: c.name,
        since: c.since,
        score: c.score,
        lastLoggedDate: c.lastLoggedDate ? dayKey(c.lastLoggedDate) : null,
      })),
    };
  }

  private dietitianRows(where: Prisma.Sql): Promise<DietitianRowRaw[]> {
    return this.db.$queryRaw<DietitianRowRaw[]>`
      SELECT dp."userId", u.email, u.name, dp.title, dp."licenseNo", dp."verifiedAt",
        o.id AS "orgId", o.name AS "orgName", o.kind AS "orgKind",
        EXISTS (SELECT 1 FROM organization_members x WHERE x."userId" = dp."userId" AND x.status = 'active') AS "hasActive",
        (SELECT count(*) FROM dietitian_client_links l WHERE l."dietitianId" = dp."userId" AND l.status = 'active') AS "activeClients",
        c.note AS "codeNote",
        ${lastActiveSql(Prisma.sql`dp."userId"`)} AS "lastActiveAt"
      FROM dietitian_profiles dp
      JOIN users u ON u.id = dp."userId"
      LEFT JOIN LATERAL (
        SELECT om."organizationId" FROM organization_members om
        WHERE om."userId" = dp."userId" AND om.status <> 'removed' ORDER BY om."joinedAt" LIMIT 1) m ON TRUE
      LEFT JOIN organizations o ON o.id = m."organizationId"
      LEFT JOIN dietitian_activation_codes c ON c.id = dp."activationCodeId"
      WHERE ${where}
      ORDER BY dp."verifiedAt" DESC`;
  }

  // ─── activation codes ──────────────────────────────────────────────────
  async listActivationCodes(now: Date): Promise<AdminActivationCode[]> {
    const codes = await this.db.dietitianActivationCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { id: true, name: true } } },
    });
    const redeemers = await this.db.dietitianProfile.findMany({
      where: { activationCodeId: { in: codes.map((c) => c.id) } },
      select: { activationCodeId: true, user: { select: { id: true, name: true, email: true } } },
    });
    return codes.map((c) => ({
      id: c.id,
      note: c.note,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt,
      createdAt: c.createdAt,
      status: activationCodeStatus(c, now),
      organization: c.organization,
      redeemedBy: redeemers
        .filter((r) => r.activationCodeId === c.id)
        .map((r) => ({ userId: r.user.id, name: r.user.name, email: r.user.email })),
    }));
  }

  async createActivationCode(record: CreateActivationCodeRecord): Promise<{ id: string }> {
    return this.db.dietitianActivationCode.create({
      data: { codeHash: record.codeHash, maxUses: record.maxUses, expiresAt: record.expiresAt, note: record.note, orgRole: 'dietitian' },
      select: { id: true },
    });
  }

  async revokeActivationCode(id: string, now: Date): Promise<boolean> {
    const result = await this.db.dietitianActivationCode.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
    return result.count > 0;
  }

  // ─── audit ─────────────────────────────────────────────────────────────
  async listAudit(limit: number, targetId?: string): Promise<AdminAuditEntry[]> {
    const where = targetId ? Prisma.sql`a."targetId" = ${targetId}` : Prisma.sql`TRUE`;
    const rows = await this.db.$queryRaw<
      Array<{
        id: string;
        adminId: string;
        adminName: string | null;
        adminEmail: string | null;
        action: string;
        targetType: string;
        targetId: string;
        targetLabel: string | null;
        details: Record<string, unknown> | null;
        createdAt: Date;
      }>
    >`
      SELECT a.id, a."adminId", ad.name AS "adminName", ad.email AS "adminEmail", a.action, a."targetType", a."targetId",
        COALESCE(t.name, t.email, c.note) AS "targetLabel", a.details, a."createdAt"
      FROM admin_audit_logs a
      LEFT JOIN users ad ON ad.id = a."adminId"
      LEFT JOIN users t ON t.id = a."targetId"
      LEFT JOIN dietitian_activation_codes c ON c.id = a."targetId"
      WHERE ${where}
      ORDER BY a."createdAt" DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      admin: r.adminEmail ? { userId: r.adminId, name: r.adminName, email: r.adminEmail } : null,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      details: r.details,
      createdAt: r.createdAt,
    }));
  }

  async appendAudit(entry: AuditInput): Promise<void> {
    await this.db.adminAuditLog.create({
      data: {
        adminId: entry.adminId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: (entry.details as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });
  }

  // ─── writes ────────────────────────────────────────────────────────────
  async suspendUser(userId: string, reason: string | null, now: Date): Promise<void> {
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { suspendedAt: now, suspendedReason: reason } }),
      this.db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
  }

  async unsuspendUser(userId: string): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { suspendedAt: null, suspendedReason: null } });
  }

  async grantPremium(userId: string): Promise<void> {
    const data = { status: 'active', expiresAt: null, willRenew: false, inGracePeriod: false };
    await this.db.subscription.upsert({
      where: { userId_productId_provider: { userId, productId: GRANT_PRODUCT_ID, provider: GRANT_PROVIDER } },
      create: { userId, productId: GRANT_PRODUCT_ID, provider: GRANT_PROVIDER, ...data },
      update: data,
    });
  }

  async revokePremium(userId: string): Promise<void> {
    await this.db.subscription.updateMany({
      where: { userId, productId: GRANT_PRODUCT_ID, provider: GRANT_PROVIDER },
      data: { status: 'canceled', willRenew: false },
    });
  }

  async setDietitianSuspended(userId: string, suspended: boolean): Promise<number> {
    const result = await this.db.organizationMember.updateMany({
      where: { userId, status: suspended ? 'active' : 'suspended' },
      data: { status: suspended ? 'suspended' : 'active' },
    });
    return result.count;
  }

  async isDietitian(userId: string): Promise<boolean> {
    return (await this.db.dietitianProfile.count({ where: { userId } })) > 0;
  }

  // ─── helpers ───────────────────────────────────────────────────────────
  private async aiByFeature(where: Prisma.Sql, since: Date): Promise<AiFeatureUsage[]> {
    const rows = await this.db.$queryRaw<Array<{ feature: string; calls: bigint; input: bigint; output: bigint }>>`
      SELECT feature, count(*) AS calls, sum("inputTokens") AS input, sum("outputTokens") AS output
      FROM ai_usage_events WHERE ${where} AND "createdAt" >= ${since}
      GROUP BY feature ORDER BY sum("inputTokens" + "outputTokens") DESC`;
    return rows.map((r) => ({ feature: r.feature, calls: num(r.calls), inputTokens: num(r.input), outputTokens: num(r.output) }));
  }

  /** Every UTC day in [since, now] with the summed `v` of `source` rows (at, v). */
  private async dailySeries(source: Prisma.Sql, since: Date, now: Date): Promise<DailyCount[]> {
    const from = dayKey(since);
    const rows = await this.db.$queryRaw<Array<{ day: Date; total: bigint | number | null }>>`
      WITH src AS (${source}),
      agg AS (SELECT date_trunc('day', at)::date AS day, sum(v) AS total FROM src WHERE at >= ${from}::date GROUP BY 1)
      SELECT d::date AS day, coalesce(agg.total, 0) AS total
      FROM generate_series(${from}::date, ${dayKey(now)}::date, interval '1 day') AS d
      LEFT JOIN agg ON agg.day = d::date
      ORDER BY d`;
    return rows.map((r) => ({ date: dayKey(r.day), value: num(r.total) }));
  }
}

function toDietitianRow(r: DietitianRowRaw): AdminDietitianRow {
  return {
    userId: r.userId,
    email: r.email,
    name: r.name,
    title: r.title,
    verifiedAt: r.verifiedAt,
    organization: r.orgId ? { id: r.orgId, name: r.orgName ?? '', kind: r.orgKind ?? 'solo' } : null,
    status: r.hasActive ? 'active' : 'suspended',
    activeClients: num(r.activeClients),
    activationCodeNote: r.codeNote,
    lastActiveAt: r.lastActiveAt,
  };
}
