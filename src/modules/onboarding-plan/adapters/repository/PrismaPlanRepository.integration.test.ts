import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { PrismaPlanRepository as PrismaPlanRepositoryType } from './PrismaPlanRepository';

/**
 * See PrismaUserProfileRepository.integration.test.ts for why Prisma is
 * loaded dynamically here, after DATABASE_URL is set, and why the
 * pgvector-enabled image is required.
 */
describe('PrismaPlanRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaPlanRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaPlanRepository } = await import('./PrismaPlanRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    await prisma.user.create({
      data: { id: 'user-1', email: 'rider@example.com', passwordHash: 'hashed-value' },
    });
    repository = new PrismaPlanRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('creates a plan and finds it by userId', async () => {
    const created = await repository.create({
      userId: 'user-1',
      dailyCalories: 1898,
      proteinG: 160,
      carbsG: 157,
      fatG: 70,
    });

    expect(created).toMatchObject({
      userId: 'user-1',
      dailyCalories: 1898,
      proteinG: 160,
      carbsG: 157,
      fatG: 70,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);

    const found = await repository.findByUserId('user-1');
    expect(found).toEqual(created);
  });

  it('returns null for a user with no plan', async () => {
    expect(await repository.findByUserId('does-not-exist')).toBeNull();
  });

  it('enforces one plan per user (userId unique constraint)', async () => {
    await expect(
      repository.create({ userId: 'user-1', dailyCalories: 2200, proteinG: 170, carbsG: 220, fatG: 70 }),
    ).rejects.toThrow();
  });
});
