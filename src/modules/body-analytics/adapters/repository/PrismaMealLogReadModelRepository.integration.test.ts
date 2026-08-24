import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { PrismaMealLogReadModelRepository as PrismaMealLogReadModelRepositoryType } from './PrismaMealLogReadModelRepository';

describe('PrismaMealLogReadModelRepository (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: PrismaMealLogReadModelRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaMealLogReadModelRepository } = await import('./PrismaMealLogReadModelRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaMealLogReadModelRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('upserts by user/date/mealType and lists rows in range', async () => {
    await repository.upsert({
      userId: 'user-1',
      date: new Date('2026-08-24T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [{ name: 'Chicken', source: 'manual', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 }],
    });
    const updated = await repository.upsert({
      userId: 'user-1',
      date: new Date('2026-08-24T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [{ name: 'Rice Bowl', source: 'manual', portionGrams: 200, calories: 410, proteinG: 12, carbsG: 72, fatG: 8 }],
    });

    expect(updated.entries[0]?.name).toBe('Rice Bowl');
    await expect(repository.listForRange('user-1', new Date('2026-08-24T00:00:00.000Z'), new Date('2026-08-24T23:59:59.999Z'))).resolves.toHaveLength(1);
  });
});
