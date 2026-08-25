import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

describe('OnboardingPlanTargetsAdapter (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    ({ prisma } = await import('../../../../shared/persistence/db'));
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  afterEach(async () => {
    if (prisma) {
      await prisma.plan.deleteMany();
      await prisma.user.deleteMany();
    }
  });

  it('reads daily targets through the real onboarding-plan GetActivePlan use case', async () => {
    const prismaClient = prisma!;

    await prismaClient.user.create({
      data: { id: 'user-1', email: 'planner@example.com', passwordHash: 'hashed-value' },
    });
    await prismaClient.plan.create({
      data: { userId: 'user-1', dailyCalories: 2200, proteinG: 160, carbsG: 220, fatG: 70 },
    });

    const { OnboardingPlanTargetsAdapter } = await import('./OnboardingPlanTargetsAdapter');
    const adapter = new OnboardingPlanTargetsAdapter();

    await expect(adapter.getDailyTargets('user-1')).resolves.toEqual({
      calories: 2200,
      proteinG: 160,
      carbsG: 220,
      fatG: 70,
    });
  });

  it('returns null when the user has no active plan', async () => {
    const { OnboardingPlanTargetsAdapter } = await import('./OnboardingPlanTargetsAdapter');
    const adapter = new OnboardingPlanTargetsAdapter();

    await expect(adapter.getDailyTargets('missing-user')).resolves.toBeNull();
  });
});
