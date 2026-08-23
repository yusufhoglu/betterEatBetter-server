import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type { PrismaMealItemRepository as PrismaMealItemRepositoryType } from './PrismaMealItemRepository';

describe('PrismaMealItemRepository (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: PrismaMealItemRepositoryType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaMealItemRepository } = await import('./PrismaMealItemRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaMealItemRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  it('appends to the existing meal item instead of creating a new row', async () => {
    const prismaClient = prisma!;
    const first = await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-23T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
      ],
    });

    const second = await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-23T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [
        { id: 'entry-2', name: 'Toast', portionGrams: 60, calories: 160, proteinG: 5, carbsG: 28, fatG: 2 },
      ],
    });

    expect(second.id).toBe(first.id);
    expect(second.entries).toHaveLength(2);
    expect(await prismaClient.mealItem.count()).toBe(1);
  });

  it('enforces the unique constraint at the database level', async () => {
    const prismaClient = prisma!;
    await repository.appendEntries({
      userId: 'user-2',
      date: new Date('2026-08-23T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [
        { id: 'entry-1', name: 'Chicken', portionGrams: 180, calories: 300, proteinG: 40, carbsG: 0, fatG: 10 },
      ],
    });

    await expect(
      prismaClient.mealItem.create({
        data: {
          userId: 'user-2',
          date: new Date('2026-08-23T00:00:00.000Z'),
          mealType: 'lunch',
          entries: [],
        },
      }),
    ).rejects.toThrow();
  });

  it('finds logged meal types in a date range without loading entries JSON', async () => {
    await repository.appendEntries({
      userId: 'user-range',
      date: new Date('2026-08-20T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 100, calories: 150, proteinG: 12, carbsG: 1, fatG: 10 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-range',
      date: new Date('2026-08-21T00:00:00.000Z'),
      mealType: 'dinner',
      entries: [
        { id: 'entry-2', name: 'Chicken', portionGrams: 180, calories: 300, proteinG: 40, carbsG: 0, fatG: 10 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-range',
      date: new Date('2026-08-21T00:00:00.000Z'),
      mealType: 'snack',
      entries: [
        { id: 'entry-3', name: 'Yogurt', portionGrams: 120, calories: 110, proteinG: 8, carbsG: 10, fatG: 3 },
      ],
    });
    await repository.appendEntries({
      userId: 'other-user',
      date: new Date('2026-08-21T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [
        { id: 'entry-4', name: 'Rice', portionGrams: 180, calories: 240, proteinG: 4, carbsG: 52, fatG: 1 },
      ],
    });

    await expect(
      repository.findMealTypesInRange(
        'user-range',
        new Date('2026-08-20T00:00:00.000Z'),
        new Date('2026-08-21T00:00:00.000Z'),
      ),
    ).resolves.toEqual([
      { date: '2026-08-20', mealType: 'breakfast' },
      { date: '2026-08-21', mealType: 'dinner' },
      { date: '2026-08-21', mealType: 'snack' },
    ]);
  });
});
