import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { PrismaUserProfileRepository as PrismaUserProfileRepositoryType } from './PrismaUserProfileRepository';

/**
 * `shared/persistence/db.ts` builds its `PrismaClient` singleton once, at
 * first import, from `process.env.DATABASE_URL` — setting the env var in
 * `beforeAll` has no effect on an already-loaded client. `PrismaUserProfileRepository`
 * (and Prisma itself) are therefore loaded dynamically below, after the
 * container starts and DATABASE_URL is set, instead of via a static top-level
 * import.
 *
 * Uses the pgvector-enabled image (matching `schema.prisma`'s `vector`
 * extension) rather than plain `postgres:16-alpine` — the migration's
 * `CREATE EXTENSION IF NOT EXISTS "vector"` would otherwise fail.
 */
describe('PrismaUserProfileRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaUserProfileRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaUserProfileRepository } = await import('./PrismaUserProfileRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    await prisma.user.create({
      data: { id: 'user-1', email: 'rider@example.com', passwordHash: 'hashed-value' },
    });
    repository = new PrismaUserProfileRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('creates a profile and finds it by userId', async () => {
    const created = await repository.create({
      userId: 'user-1',
      weightKg: 80,
      targetWeightKg: 72,
      initialWeightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'male',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });

    expect(created).toMatchObject({
      userId: 'user-1',
      weightKg: 80,
      targetWeightKg: 72,
      initialWeightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'male',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });
    expect(created.createdAt).toBeInstanceOf(Date);

    const found = await repository.findByUserId('user-1');
    expect(found).toEqual(created);
  });

  it('returns null for a user with no profile', async () => {
    expect(await repository.findByUserId('does-not-exist')).toBeNull();
  });

  it('round-trips the optional tape measurements, defaulting them to null', async () => {
    await prisma.user.create({
      data: { id: 'user-tape', email: 'tape@example.com', passwordHash: 'hashed-value' },
    });

    const created = await repository.create({
      userId: 'user-tape',
      weightKg: 80,
      targetWeightKg: 72,
      initialWeightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'male',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
      waistCm: 90,
      neckCm: 40,
      shoulderCm: 120,
    });

    expect(created).toMatchObject({ waistCm: 90, neckCm: 40, hipCm: null, shoulderCm: 120 });
    expect(await repository.findByUserId('user-tape')).toMatchObject({
      waistCm: 90,
      neckCm: 40,
      hipCm: null,
      shoulderCm: 120,
    });
  });

  it('supports a null targetWeightKg while keeping initialWeightKg required', async () => {
    await prisma.user.create({
      data: { id: 'user-2', email: 'targetless@example.com', passwordHash: 'hashed-value' },
    });

    const created = await repository.create({
      userId: 'user-2',
      weightKg: 92,
      targetWeightKg: null,
      initialWeightKg: 92,
      heightCm: 190,
      age: 33,
      gender: 'male',
      workoutsPerWeek: 2,
      goal: 'maintain',
      weeklyPaceKg: 0.25,
    });

    expect(created).toMatchObject({
      targetWeightKg: null,
      initialWeightKg: 92,
    });
  });
});
