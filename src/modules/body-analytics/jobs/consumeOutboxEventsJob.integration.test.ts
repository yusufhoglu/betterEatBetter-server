import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { ConsumeOutboxEventsJob } from './consumeOutboxEventsJob';
import type { PrismaMealLogReadModelRepository as PrismaMealLogReadModelRepositoryType } from '../adapters/repository/PrismaMealLogReadModelRepository';

describe('ConsumeOutboxEventsJob (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let mealRepository: PrismaMealLogReadModelRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaMealLogReadModelRepository } = await import('../adapters/repository/PrismaMealLogReadModelRepository');
    ({ prisma } = await import('../../../shared/persistence/db'));
    mealRepository = new PrismaMealLogReadModelRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('writes the read model and marks the outbox row as processed', async () => {
    const event = await prisma!.outboxEvent.create({
      data: {
        eventType: 'meal.logged',
        payload: {
          userId: 'user-1',
          date: '2026-08-24',
          mealType: 'dinner',
          mealItemId: 'meal-1',
          entries: [{ name: 'Chicken', source: 'manual', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 }],
        },
      },
    });

    const job = new ConsumeOutboxEventsJob(prisma!, mealRepository);
    await expect(job.execute()).resolves.toBe(1);
    await expect(mealRepository.listForRange('user-1', new Date('2026-08-24T00:00:00.000Z'), new Date('2026-08-24T23:59:59.999Z'))).resolves.toHaveLength(1);
    await expect(prisma!.outboxEvent.findUnique({ where: { id: event.id } })).resolves.toEqual(
      expect.objectContaining({ processedAt: expect.any(Date) }),
    );
  });

  it('leaves processedAt null when persistence fails', async () => {
    const failingEvent = await prisma!.outboxEvent.create({
      data: {
        eventType: 'meal.logged',
        payload: {
          userId: 'user-2',
          date: '2026-08-24',
          mealType: 'lunch',
          mealItemId: 'meal-2',
          entries: [{ name: 'Rice', source: 'manual', portionGrams: 200, calories: 410, proteinG: 12, carbsG: 72, fatG: 8 }],
        },
      },
    });

    const job = new ConsumeOutboxEventsJob(prisma!, {
      upsert: jest.fn().mockRejectedValue(new Error('write failed')),
      delete: jest.fn(),
      listForRange: jest.fn(),
    });

    await expect(job.execute()).resolves.toBe(0);
    await expect(prisma!.outboxEvent.findUnique({ where: { id: failingEvent.id } })).resolves.toEqual(
      expect.objectContaining({ processedAt: null }),
    );
  });
});
