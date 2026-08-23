import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaRefreshTokenRepository as PrismaRefreshTokenRepositoryType } from './PrismaRefreshTokenRepository';

/**
 * Same env/module-singleton timing nuance as PrismaUserRepository's
 * integration test: `PrismaRefreshTokenRepository` (via
 * shared/auth/refreshTokenService.ts) and shared/persistence/db.ts are
 * imported dynamically, after DATABASE_URL is pointed at the container.
 *
 * `PrismaRefreshTokenRepository` is a thin delegate to
 * shared/auth/refreshTokenService.ts (a conscious architectural choice —
 * rotation/reuse-detection has a single source of truth so JWT secret and
 * hashing stay consistent). This test exercises that real behavior against a
 * real Postgres, not a reimplementation.
 */
describe('PrismaRefreshTokenRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaRefreshTokenRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaRefreshTokenRepository } = await import('./PrismaRefreshTokenRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaRefreshTokenRepository();
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  afterEach(async () => {
    await prisma.refreshToken.deleteMany();
  });

  async function seedUser(): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.com`, passwordHash: 'irrelevant-for-this-test' },
    });
    return user.id;
  }

  it('issues an active token stored with a SHA-256 hash, not the plain value', async () => {
    const userId = await seedUser();

    const issued = await repository.issue(userId);

    const expectedHash = createHash('sha256').update(issued.token).digest('hex');
    const stored = await prisma.$queryRaw<Array<{ tokenHash: string; revokedAt: Date | null }>>`
      SELECT "tokenHash", "revokedAt" FROM "refresh_tokens" WHERE "userId" = ${userId}
    `;

    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toBe(issued.token);
    expect(stored[0]!.tokenHash).toBe(expectedHash);
    expect(stored[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]!.revokedAt).toBeNull();
  });

  it('status transitions: active -> used (rotated, revokedAt + replacedById set) -> new token active', async () => {
    const userId = await seedUser();
    const issued = await repository.issue(userId);

    const rotated = await repository.rotate(issued.token);

    const oldHash = createHash('sha256').update(issued.token).digest('hex');
    const newHash = createHash('sha256').update(rotated.refreshToken.token).digest('hex');

    const oldRow = await prisma.refreshToken.findUnique({ where: { tokenHash: oldHash } });
    const newRow = await prisma.refreshToken.findUnique({ where: { tokenHash: newHash } });

    expect(oldRow).not.toBeNull();
    expect(oldRow!.revokedAt).not.toBeNull();
    expect(oldRow!.replacedById).toBe(newRow!.id);

    expect(newRow).not.toBeNull();
    expect(newRow!.revokedAt).toBeNull();
    expect(newRow!.replacedById).toBeNull();
  });

  it('reuse detection: presenting an already-rotated token revokes every active token for that user in the DB', async () => {
    const userId = await seedUser();
    const first = await repository.issue(userId);
    const second = await repository.issue(userId);

    await repository.rotate(first.token);

    await expect(repository.rotate(first.token)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSE_DETECTED',
    });

    const secondHash = createHash('sha256').update(second.token).digest('hex');
    const secondRow = await prisma.refreshToken.findUnique({ where: { tokenHash: secondHash } });
    expect(secondRow!.revokedAt).not.toBeNull();

    const allForUser = await prisma.refreshToken.findMany({ where: { userId } });
    expect(allForUser.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it('throws for a token that was never issued', async () => {
    await expect(repository.rotate('never-issued-token')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });
});
