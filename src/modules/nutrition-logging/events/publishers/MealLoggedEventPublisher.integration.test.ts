import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { MealItem } from '../../domain/MealItem';
import type { MealLoggedEventPublisher as MealLoggedEventPublisherType } from './MealLoggedEventPublisher';
import type { PrismaMealItemRepository as PrismaMealItemRepositoryType } from '../../adapters/repository/PrismaMealItemRepository';

describe('MealLoggedEventPublisher (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: PrismaMealItemRepositoryType;
  let publisher: MealLoggedEventPublisherType;
  let LogMealEntries: any;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const repositoryModule = await import('../../adapters/repository/PrismaMealItemRepository');
    const publisherModule = await import('./MealLoggedEventPublisher');
    const useCaseModule = await import('../../use-cases/LogMealEntries');
    ({ prisma } = await import('../../../../shared/persistence/db'));

    repository = new repositoryModule.PrismaMealItemRepository(prisma);
    publisher = new publisherModule.MealLoggedEventPublisher();
    LogMealEntries = useCaseModule.LogMealEntries;
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('creates an outbox row when LogMealEntries succeeds', async () => {
    const prismaClient = prisma!;
    const useCase = new LogMealEntries(repository, publisher);

    const mealItem = (await useCase.execute({
      userId: 'user-1',
      date: new Date('2026-08-23T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
      ],
    })) as MealItem;

    const outboxRows = await prismaClient.outboxEvent.findMany({ orderBy: { createdAt: 'asc' } });
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toMatchObject({
      eventType: 'meal.logged',
      payload: {
        userId: 'user-1',
        date: '2026-08-23',
        mealType: 'breakfast',
        mealItemId: mealItem.id,
        entries: [
          {
            name: 'Eggs',
            source: 'manual',
            portionGrams: 120,
            calories: 180,
            proteinG: 14,
            carbsG: 2,
            fatG: 12,
          },
        ],
      },
    });
  });

  it('rolls back both meal item and outbox row when publishing fails', async () => {
    const prismaClient = prisma!;
    const mealItemCountBefore = await prismaClient.mealItem.count();
    const outboxCountBefore = await prismaClient.outboxEvent.count();
    const failingPublisher = {
      publishLogged: jest.fn(async (tx, payload) => {
        await publisher.publishLogged(tx, payload);
        throw new ValidationError('FORCED_ROLLBACK', 'Forcing rollback');
      }),
    };
    const useCase = new LogMealEntries(repository, failingPublisher);

    await expect(
      useCase.execute({
        userId: 'user-2',
        date: new Date('2026-08-23T00:00:00.000Z'),
        mealType: 'dinner',
        entries: [
          { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await prismaClient.mealItem.count()).toBe(mealItemCountBefore);
    expect(await prismaClient.outboxEvent.count()).toBe(outboxCountBefore);
  });
});
