import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { PrismaFoodEntryRepository } from './PrismaFoodEntryRepository';

describe('PrismaFoodEntryRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaFoodEntryRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();

    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    // Run Prisma migrations against the test database
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    repository = new PrismaFoodEntryRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  afterEach(async () => {
    await prisma.foodEntry.deleteMany();
  });

  it('creates a food entry with processing status', async () => {
    await repository.create({ id: 'photo-001', userId: 'user-001', status: 'processing' });

    const found = await prisma.foodEntry.findUnique({ where: { id: 'photo-001' } });
    expect(found).not.toBeNull();
    expect(found!.status).toBe('processing');
    expect(found!.userId).toBe('user-001');
  });

  it('updates a food entry result to completed', async () => {
    await repository.create({ id: 'photo-002', userId: 'user-002', status: 'processing' });

    await repository.updateResult('photo-002', {
      status: 'completed',
      items: [
        {
          name: 'Rice',
          portionGrams: 150,
          calories: 195,
          proteinGrams: 4,
          carbsGrams: 43,
          fatGrams: 0.4,
        },
      ],
      macros: { totalCalories: 195, totalProteinGrams: 4, totalCarbsGrams: 43, totalFatGrams: 0.4 },
      needsUserAction: false,
    });

    const updated = await repository.findById('photo-002');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('completed');
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0]!.name).toBe('Rice');
    expect(updated!.needsUserAction).toBe(false);
  });

  it('updates a food entry to failed with errorCode', async () => {
    await repository.create({ id: 'photo-003', userId: 'user-003', status: 'processing' });

    await repository.updateResult('photo-003', {
      status: 'failed',
      errorCode: 'RAG_SERVICE_ERROR',
    });

    const updated = await repository.findById('photo-003');
    expect(updated!.status).toBe('failed');
    expect(updated!.errorCode).toBe('RAG_SERVICE_ERROR');
  });

  it('returns null for a non-existent entry', async () => {
    const result = await repository.findById('does-not-exist');
    expect(result).toBeNull();
  });

  it('updates to insufficient_data and sets needsUserAction', async () => {
    await repository.create({ id: 'photo-004', userId: 'user-004', status: 'processing' });

    await repository.updateResult('photo-004', {
      status: 'insufficient_data',
      items: [],
      macros: { totalCalories: 0, totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0 },
      needsUserAction: true,
    });

    const found = await repository.findById('photo-004');
    expect(found!.status).toBe('insufficient_data');
    expect(found!.needsUserAction).toBe(true);
  });
});
