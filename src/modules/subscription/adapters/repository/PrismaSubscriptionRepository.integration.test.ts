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

  it('findLatestByUserId prefers an active row over a more-recently-touched non-entitled one', async () => {
    // Simulates a plan upgrade: the old monthly row gets superseded (touched)
    // *after* the new yearly row was created, so it has the newer updatedAt —
    // picking by recency alone would wrongly surface the stale, non-entitled
    // plan as "latest".
    await repository.upsert({
      userId,
      productId: 'premium_yearly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2028-01-01T00:00:00.000Z'),
      purchaseToken: 'token-new',
      willRenew: true,
      inGracePeriod: false,
    });
    await repository.upsert({
      userId,
      productId: 'premium_monthly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      purchaseToken: 'token-old',
      willRenew: true,
      inGracePeriod: false,
    });
    await repository.supersede({ purchaseToken: 'token-old', expectedUserId: userId });

    const latest = await repository.findLatestByUserId(userId);
    expect(latest?.productId).toBe('premium_yearly');
    expect(latest?.status).toBe('active');
  });

  it('supersede marks the row status superseded and stops it being entitled', async () => {
    await repository.upsert({
      userId,
      productId: 'premium_monthly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      purchaseToken: 'token-old',
      willRenew: true,
      inGracePeriod: false,
    });

    await repository.supersede({ purchaseToken: 'token-old', expectedUserId: userId });

    const found = await repository.findByPurchaseToken('token-old');
    expect(found?.status).toBe('superseded');
    expect(found?.willRenew).toBe(false);
  });

  it('supersede is a no-op when the purchaseToken belongs to a different user', async () => {
    await repository.upsert({
      userId,
      productId: 'premium_monthly',
      provider: 'google',
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      purchaseToken: 'token-old',
      willRenew: true,
      inGracePeriod: false,
    });

    await repository.supersede({ purchaseToken: 'token-old', expectedUserId: 'someone-else' });

    const found = await repository.findByPurchaseToken('token-old');
    expect(found?.status).toBe('active');
  });

  it('supersede is a no-op when the purchaseToken is unknown', async () => {
    await expect(repository.supersede({ purchaseToken: 'does-not-exist', expectedUserId: userId })).resolves.toBeUndefined();
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
