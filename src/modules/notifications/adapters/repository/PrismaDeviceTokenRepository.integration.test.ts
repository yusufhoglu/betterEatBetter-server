import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PrismaDeviceTokenRepository as PrismaDeviceTokenRepositoryType } from './PrismaDeviceTokenRepository';

describe('PrismaDeviceTokenRepository (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: PrismaDeviceTokenRepositoryType;

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await prisma!.user.create({ data: { id, email: `${id}@example.com` } });
    return id;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaDeviceTokenRepository } = await import('./PrismaDeviceTokenRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaDeviceTokenRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('upserts by token, refreshing owner/timezone on re-registration', async () => {
    const userA = await createUser();
    const userB = await createUser();

    const first = await repository.upsertByToken({
      userId: userA,
      platform: 'android',
      token: 'shared-device-token',
      timezone: 'Europe/Istanbul',
      locale: 'tr',
    });
    const second = await repository.upsertByToken({
      userId: userB,
      platform: 'android',
      token: 'shared-device-token',
      timezone: 'America/New_York',
      locale: 'en',
    });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ userId: userB, timezone: 'America/New_York', locale: 'en' });
    await expect(repository.listByUserId(userA)).resolves.toHaveLength(0);
    await expect(repository.listByUserId(userB)).resolves.toHaveLength(1);
  });

  it('paginates every token by cursor', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i += 1) {
      await repository.upsertByToken({
        userId: user,
        platform: 'ios',
        token: `paginate-${i}`,
        timezone: 'UTC',
        locale: 'en',
      });
    }

    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await repository.listPage({ cursor, limit: 2 });
      for (const row of page.tokens) {
        seen.add(row.token);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    for (let i = 0; i < 5; i += 1) {
      expect(seen.has(`paginate-${i}`)).toBe(true);
    }
  });

  it('deleteByToken is idempotent', async () => {
    await expect(repository.deleteByToken('never-existed')).resolves.toBeUndefined();
  });
});
