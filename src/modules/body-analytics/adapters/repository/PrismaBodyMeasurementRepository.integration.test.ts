import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { PrismaBodyMeasurementRepository as PrismaBodyMeasurementRepositoryType } from './PrismaBodyMeasurementRepository';

describe('PrismaBodyMeasurementRepository (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: PrismaBodyMeasurementRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaBodyMeasurementRepository } = await import('./PrismaBodyMeasurementRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaBodyMeasurementRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('creates, lists, and finds the latest measurement', async () => {
    await repository.create({
      userId: 'user-1',
      metric: 'weight',
      value: 80,
      unit: 'kg',
      date: new Date('2026-08-20T00:00:00.000Z'),
      source: 'manual',
    });
    await repository.create({
      userId: 'user-1',
      metric: 'weight',
      value: 79,
      unit: 'kg',
      date: new Date('2026-08-24T00:00:00.000Z'),
      source: 'manual',
    });

    await expect(repository.findLatestByMetric('user-1', 'weight')).resolves.toEqual(
      expect.objectContaining({ value: 79 }),
    );
    await expect(repository.findForMetricInRange('user-1', 'weight', new Date('2026-08-19T00:00:00.000Z'), new Date('2026-08-24T23:59:59.999Z'))).resolves.toHaveLength(2);
  });
});
