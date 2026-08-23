import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { PrismaUserRepository as PrismaUserRepositoryType } from './PrismaUserRepository';

/**
 * `shared/persistence/db.ts` builds its `PrismaClient` singleton once, at
 * first import, from `process.env.DATABASE_URL` — setting the env var in
 * `beforeAll` has no effect on an already-loaded client. `PrismaUserRepository`
 * (and the shared `db` module it imports) are therefore loaded dynamically
 * below, after the container starts and DATABASE_URL is set, instead of via a
 * static top-level import. Each Jest test file gets its own module registry,
 * so this is the first (and only) load of these modules in this file.
 *
 * Uses the pgvector-enabled image (matching `schema.prisma`'s `vector`
 * extension) rather than plain `postgres:16-alpine` — the migration's
 * `CREATE EXTENSION IF NOT EXISTS "vector"` would otherwise fail.
 */
describe('PrismaUserRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaUserRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaUserRepository } = await import('./PrismaUserRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaUserRepository();
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
  });

  it('creates a user and finds it by id and by email', async () => {
    const created = await repository.create({ email: 'rider@example.com', passwordHash: 'hashed-value' });

    expect(created.id).toBeTruthy();
    expect(created.email).toBe('rider@example.com');
    expect(created.passwordHash).toBe('hashed-value');

    const byId = await repository.findById(created.id);
    expect(byId).not.toBeNull();
    expect(byId!.email).toBe('rider@example.com');

    const byEmail = await repository.findByEmail('rider@example.com');
    expect(byEmail).not.toBeNull();
    expect(byEmail!.id).toBe(created.id);
  });

  it('returns null for an unknown id or email', async () => {
    expect(await repository.findById('does-not-exist')).toBeNull();
    expect(await repository.findByEmail('nobody@example.com')).toBeNull();
  });

  it('enforces the email unique constraint', async () => {
    await repository.create({ email: 'dup@example.com', passwordHash: 'hash-one' });

    await expect(repository.create({ email: 'dup@example.com', passwordHash: 'hash-two' })).rejects.toThrow();
  });
});
