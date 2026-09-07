import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Recipe } from '../../../dietician/domain/Recipe';
import type { PrismaMeCatalogRepository as RepoType } from './PrismaMeCatalogRepository';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://example.com/signed-recipe-photo'),
}));

const RECIPE: Recipe = {
  title: 'High-protein chicken bowl',
  subtitle: 'Quick weeknight dinner',
  timeMinutes: 20,
  servings: 2,
  calories: 550,
  proteinGrams: 45,
  carbsGrams: 40,
  fatGrams: 18,
  fiberGrams: 6,
  ingredients: [
    { name: 'chicken breast', amount: '300g' },
    { name: 'brown rice', amount: '1 cup dry' },
  ],
  steps: ['Grill the chicken.', 'Cook the rice.', 'Combine and season.'],
  why: 'Hits your remaining protein target for today.',
};

describe('PrismaMeCatalogRepository — saved recipes (integration)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient | undefined;
  let repository: RepoType;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { PrismaMeCatalogRepository } = await import('./PrismaMeCatalogRepository');
    ({ prisma } = await import('../../../../shared/persistence/db'));
    repository = new PrismaMeCatalogRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  async function seedUser(): Promise<string> {
    const user = await prisma!.user.create({
      data: { email: `${randomUUID()}@example.com` },
    });
    return user.id;
  }

  it('round-trips a full recipe through create → list', async () => {
    const userId = await seedUser();

    const created = await repository.createSavedRecipe({ userId, recipe: RECIPE });
    expect(created.recipe).toEqual(RECIPE);
    expect(created.imageUrl).toBeNull();
    expect(created.mealPhotoId).toBeNull();

    const listed = await repository.listSavedRecipes(userId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.recipe).toEqual(RECIPE);
  });

  it('signs the attached photo url on read when a photo reference is stored', async () => {
    const userId = await seedUser();
    const mealPhotoId = randomUUID();

    const created = await repository.createSavedRecipe({ userId, recipe: RECIPE, mealPhotoId });
    expect(created.imageUrl).toBe('https://example.com/signed-recipe-photo');
    expect(created.mealPhotoId).toBe(mealPhotoId);
  });

  it('omits optional recipe fields that were never set', async () => {
    const userId = await seedUser();
    const minimal: Recipe = {
      title: 'Plain omelette',
      timeMinutes: 10,
      servings: 1,
      calories: 300,
      proteinGrams: 20,
      carbsGrams: 2,
      fatGrams: 22,
      ingredients: [{ name: 'eggs', amount: '3' }],
      steps: ['Beat and cook.'],
    };

    const created = await repository.createSavedRecipe({ userId, recipe: minimal });
    expect(created.recipe).toEqual(minimal);
    expect(created.recipe).not.toHaveProperty('subtitle');
    expect(created.recipe).not.toHaveProperty('why');
  });

  it('attaches, then clears, a photo via updateSavedRecipe', async () => {
    const userId = await seedUser();
    const created = await repository.createSavedRecipe({ userId, recipe: RECIPE });
    const mealPhotoId = randomUUID();

    const withPhoto = await repository.updateSavedRecipe({
      userId,
      id: created.id,
      mealPhotoId,
    });
    expect(withPhoto.id).toBe(created.id);
    expect(withPhoto.mealPhotoId).toBe(mealPhotoId);
    expect(withPhoto.imageUrl).toBe('https://example.com/signed-recipe-photo');
    expect(withPhoto.recipe).toEqual(RECIPE);

    const cleared = await repository.updateSavedRecipe({
      userId,
      id: created.id,
      mealPhotoId: null,
    });
    expect(cleared.mealPhotoId).toBeNull();
    expect(cleared.imageUrl).toBeNull();
  });

  it('updateSavedRecipe rejects another user’s row', async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const created = await repository.createSavedRecipe({ userId, recipe: RECIPE });

    await expect(
      repository.updateSavedRecipe({ userId: otherUserId, id: created.id, mealPhotoId: null }),
    ).rejects.toThrow('Saved recipe was not found');
  });

  it('deletes only the caller’s row', async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();

    const created = await repository.createSavedRecipe({ userId, recipe: RECIPE });

    await expect(repository.deleteSavedRecipe(otherUserId, created.id)).rejects.toThrow(
      'Saved recipe was not found',
    );

    await repository.deleteSavedRecipe(userId, created.id);
    expect(await repository.listSavedRecipes(userId)).toHaveLength(0);
  });
});
