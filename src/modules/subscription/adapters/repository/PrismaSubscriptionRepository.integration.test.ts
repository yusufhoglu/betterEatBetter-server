import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { PrismaSubscriptionRepository } from './PrismaSubscriptionRepository';

describe('PrismaSubscriptionRepository (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repository: PrismaSubscriptionRepository;
  let userId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();

    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    repository = new PrismaSubscriptionRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: `${Date.now()}-${Math.random()}@test.local`, passwordHash: 'not-a-real-hash' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.subscription.deleteMany();
    await prisma.user.deleteMany();
  });

  it('creates a subscription on first upsert', async () => {
    const created = await repository.upsert({
      userId,
      productId: 'premium_yearly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      purchaseToken: 'token-1',
      willRenew: true,
      inGracePeriod: false,
    });

    expect(created.userId).toBe(userId);
    expect(created.status).toBe('active');
    expect(created.purchaseToken).toBe('token-1');
    expect(created.willRenew).toBe(true);
    expect(created.inGracePeriod).toBe(false);
  });

  it('updates the existing row on a second upsert for the same userId/productId/provider', async () => {
    await repository.upsert({
      userId,
      productId: 'premium_yearly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      purchaseToken: 'token-1',
      willRenew: true,
      inGracePeriod: false,
    });

    const updated = await repository.upsert({
      userId,
      productId: 'premium_yearly',
      provider: 'google',
      status: 'canceled',
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      purchaseToken: 'token-1',
      willRenew: false,
      inGracePeriod: false,
    });

    const all = await prisma.subscription.findMany({ where: { userId } });
    expect(all).toHaveLength(1);
    expect(updated.status).toBe('canceled');
    expect(updated.willRenew).toBe(false);
    expect(updated.expiresAt).toEqual(new Date('2026-12-01T00:00:00.000Z'));
  });

  it('findLatestByUserId returns the most recently updated row', async () => {
    await repository.upsert({
      userId,
      productId: 'premium_monthly',
      provider: 'google',
      status: 'canceled',
      expiresAt: null,
      purchaseToken: 'token-old',
      willRenew: false,
      inGracePeriod: false,
    });
    await repository.upsert({
      userId,
      productId: 'premium_yearly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      purchaseToken: 'token-new',
      willRenew: true,
      inGracePeriod: false,
    });

    const latest = await repository.findLatestByUserId(userId);
    expect(latest?.productId).toBe('premium_yearly');
  });

  it('findLatestByUserId returns null when the user has no subscriptions', async () => {
    const result = await repository.findLatestByUserId(userId);
    expect(result).toBeNull();
  });

  it('findByPurchaseToken looks a subscription up by its Google Play purchaseToken', async () => {
    await repository.upsert({
      userId,
      productId: 'premium_yearly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      purchaseToken: 'token-abc',
      willRenew: true,
      inGracePeriod: false,
    });

    const found = await repository.findByPurchaseToken('token-abc');
    expect(found?.userId).toBe(userId);

    const notFound = await repository.findByPurchaseToken('does-not-exist');
    expect(notFound).toBeNull();
  });
});
