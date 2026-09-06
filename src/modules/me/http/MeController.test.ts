import express from 'express';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { errorMapperMiddleware } from '../../../shared/errors/errorMapper';
import { NotFoundError } from '../../../shared/errors/NotFoundError';

jest.mock('../../../shared/rateLimiting/dailyQuota', () => ({
  peekDailyQuota: jest.fn(async (_key: string, limit: number) => ({
    used: 0,
    limit,
    remaining: limit,
    resetsAt: new Date('2026-09-04T00:00:00.000Z'),
  })),
}));

// eslint-disable-next-line import/first
import { MeController } from './MeController';

function buildApp() {
  const favoriteRecipes: Array<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    prepTimeMinutes: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    mealPhotoId: string | null;
  }> = [
    {
      id: 'fav-1',
      title: 'Lemon Herb Salmon Pasta',
      imageUrl: null,
      emoji: 'pasta',
      kcal: 420,
      prepTimeMinutes: 25,
      proteinG: null,
      carbsG: null,
      fatG: null,
      mealPhotoId: null,
    },
  ];
  const savedRecipes: Array<{
    id: string;
    recipe: unknown;
    imageUrl: string | null;
    mealPhotoId: string | null;
    createdAt: string;
  }> = [];
  const myMeals: Array<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    proteinG: number;
    carbsG: number | null;
    fatG: number | null;
    mealPhotoId: string | null;
  }> = [
    {
      id: 'meal-1',
      title: 'My Protein Omelette',
      imageUrl: null,
      emoji: 'omelette',
      kcal: 340,
      proteinG: 32,
      carbsG: null,
      fatG: null,
      mealPhotoId: null,
    },
  ];

  const controller = new MeController(
    {
      execute: async (userId: string) => ({
        id: userId,
        email: 'alex@example.com',
        passwordHash: 'hash',
        name: 'Alex Morgan',
        username: 'alexmorgan',
        bio: 'Building healthier habits',
        avatarUrl: null,
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    } as never,
    {
      execute: async () => ({
        id: 'user-1',
        email: 'alex@example.com',
        passwordHash: 'hash',
        name: 'Alex Morgan',
        username: 'alexmorgan',
        bio: 'Building healthier habits',
        avatarUrl: null,
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    } as never,
    {
      execute: async () => ({
        userId: 'user-1',
        weightKg: 72.4,
        targetWeightKg: 68,
        initialWeightKg: 75.2,
        heightCm: 178,
        age: 28,
        gender: 'female',
        workoutsPerWeek: 4,
        goal: 'lose',
        weeklyPaceKg: 0.5,
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    } as never,
    {
      execute: async () => ({
        userId: 'user-1',
        dailyCalories: 2100,
        proteinG: 126,
        carbsG: 188,
        fatG: 70,
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    } as never,
    { execute: async () => ({}) } as never,
    { execute: async () => ({}) } as never,
    { execute: async () => true } as never,
    {
      listFavoriteRecipes: async () => favoriteRecipes,
      createFavoriteRecipe: async (input: {
        userId?: string;
        title: string;
        imageUrl?: string | null;
        emoji?: string | null;
        kcal: number;
        prepTimeMinutes?: number | null;
        proteinG?: number | null;
        carbsG?: number | null;
        fatG?: number | null;
        mealPhotoId?: string | null;
      }) => {
        const existing = input.mealPhotoId
          ? favoriteRecipes.find((f) => f.mealPhotoId === input.mealPhotoId)
          : undefined;
        if (existing) {
          return existing;
        }
        const created = {
          id: 'fav-2',
          title: input.title,
          imageUrl: input.imageUrl ?? null,
          emoji: input.emoji ?? null,
          kcal: input.kcal,
          prepTimeMinutes: input.prepTimeMinutes ?? null,
          proteinG: input.proteinG ?? null,
          carbsG: input.carbsG ?? null,
          fatG: input.fatG ?? null,
          mealPhotoId: input.mealPhotoId ?? null,
        };
        favoriteRecipes.push(created);
        return created;
      },
      deleteFavoriteRecipe: async (_userId: string, id: string) => {
        const index = favoriteRecipes.findIndex((item) => item.id === id);
        if (index >= 0) {
          favoriteRecipes.splice(index, 1);
        }
      },
      listMyMeals: async () => myMeals,
      createMyMeal: async (input: {
        userId?: string;
        title: string;
        imageUrl?: string | null;
        emoji?: string | null;
        kcal: number;
        proteinG: number;
        carbsG?: number | null;
        fatG?: number | null;
        mealPhotoId?: string | null;
      }) => {
        const existing = input.mealPhotoId
          ? myMeals.find((m) => m.mealPhotoId === input.mealPhotoId)
          : undefined;
        if (existing) {
          return existing;
        }
        const created = {
          id: 'meal-2',
          title: input.title,
          imageUrl: input.imageUrl ?? null,
          emoji: input.emoji ?? null,
          kcal: input.kcal,
          proteinG: input.proteinG,
          carbsG: input.carbsG ?? null,
          fatG: input.fatG ?? null,
          mealPhotoId: input.mealPhotoId ?? null,
        };
        myMeals.push(created);
        return created;
      },
      updateMyMeal: async (input: {
        userId?: string;
        id: string;
        title?: string;
        imageUrl?: string | null;
        emoji?: string | null;
        kcal?: number;
        proteinG?: number;
      }) => {
        const existing = myMeals.find((item) => item.id === input.id)!;
        if (input.title !== undefined) {
          existing.title = input.title;
        }
        if (input.imageUrl !== undefined) {
          existing.imageUrl = input.imageUrl;
        }
        if (input.emoji !== undefined) {
          existing.emoji = input.emoji;
        }
        if (input.kcal !== undefined) {
          existing.kcal = input.kcal;
        }
        if (input.proteinG !== undefined) {
          existing.proteinG = input.proteinG;
        }
        return existing;
      },
      deleteMyMeal: async (_userId: string, id: string) => {
        const index = myMeals.findIndex((item) => item.id === id);
        if (index >= 0) {
          myMeals.splice(index, 1);
        }
      },
      listSavedRecipes: async () => savedRecipes,
      createSavedRecipe: async (input: {
        userId?: string;
        recipe: unknown;
        mealPhotoId?: string | null;
        mealPhotoOwnerId?: string | null;
      }) => {
        const created = {
          id: `saved-recipe-${savedRecipes.length + 1}`,
          recipe: input.recipe,
          imageUrl: null,
          mealPhotoId: input.mealPhotoId ?? null,
          createdAt: '2026-09-06T00:00:00.000Z',
        };
        savedRecipes.push(created);
        return created;
      },
      deleteSavedRecipe: async (_userId: string, id: string) => {
        const index = savedRecipes.findIndex((item) => item.id === id);
        if (index < 0) {
          throw new NotFoundError('SAVED_RECIPE_NOT_FOUND', 'Saved recipe was not found');
        }
        savedRecipes.splice(index, 1);
      },
    } as never,
    {
      getNotificationPreferences: async () => ({
        masterEnabled: true,
        breakfast: { enabled: true, time: '08:30' },
        lunch: { enabled: true, time: '12:30' },
        dinner: { enabled: true, time: '19:30' },
        waterReminders: true,
        streakSaver: true,
        weeklyReport: true,
      }),
      upsertNotificationPreferences: async (_userId: string, input: unknown) => input,
      getUnitPreferences: async () => ({
        weightUnit: 'kg',
        heightUnit: 'cm',
        energyUnit: 'kcal',
        waterUnit: 'ml',
      }),
      upsertUnitPreferences: async (_userId: string, input: unknown) => input,
    } as never,
    {
      execute: async (input: {
        userId: string;
        recipe: unknown;
        mealPhotoId?: string | null;
      }) => {
        const created = {
          id: `saved-recipe-${savedRecipes.length + 1}`,
          recipe: input.recipe,
          imageUrl: null,
          mealPhotoId: input.mealPhotoId ?? null,
          createdAt: '2026-09-06T00:00:00.000Z',
        };
        savedRecipes.push(created);
        return created;
      },
    } as never,
  );

  const fakeAuthMiddleware: RequestHandler = (req, _res, next) => {
    req.auth = { userId: 'user-1' };
    next();
  };

  const app = express();
  app.use(express.json());
  app.get('/profile', fakeAuthMiddleware, controller.handleGetProfile);
  app.get('/goal', fakeAuthMiddleware, controller.handleGetGoal);
  app.get('/favorite-recipes', fakeAuthMiddleware, controller.handleGetFavoriteRecipes);
  app.post('/favorite-recipes', fakeAuthMiddleware, controller.handlePostFavoriteRecipe);
  app.delete('/favorite-recipes/:id', fakeAuthMiddleware, controller.handleDeleteFavoriteRecipe);
  app.get('/my-meals', fakeAuthMiddleware, controller.handleGetMyMeals);
  app.post('/my-meals', fakeAuthMiddleware, controller.handlePostMyMeal);
  app.patch('/my-meals/:id', fakeAuthMiddleware, controller.handlePatchMyMeal);
  app.delete('/my-meals/:id', fakeAuthMiddleware, controller.handleDeleteMyMeal);
  app.get('/saved-recipes', fakeAuthMiddleware, controller.handleGetSavedRecipes);
  app.post('/saved-recipes', fakeAuthMiddleware, controller.handlePostSavedRecipe);
  app.delete('/saved-recipes/:id', fakeAuthMiddleware, controller.handleDeleteSavedRecipe);
  app.patch('/notification-preferences', fakeAuthMiddleware, controller.handlePatchNotificationPreferences);
  app.use(errorMapperMiddleware);

  return app;
}

describe('MeController', () => {
  test('GET /profile returns the mobile contract shape with age', async () => {
    const app = buildApp();

    const res = await request(app).get('/profile');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'user-1',
      name: 'Alex Morgan',
      username: 'alexmorgan',
      bio: 'Building healthier habits',
      avatarUrl: null,
      heightCm: 178,
      weightKg: 72.4,
      age: 28,
      isPremium: true,
      usage: {
        photo: { used: 0, limit: null, remaining: null, resetsAt: '2026-09-04T00:00:00.000Z' },
        chat: { used: 0, limit: null, remaining: null, resetsAt: '2026-09-04T00:00:00.000Z' },
      },
    });
  });

  test('GET /goal maps internal plan/profile data to the mobile goal contract', async () => {
    const app = buildApp();

    const res = await request(app).get('/goal');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      goalLabel: 'Lose Weight',
      targetWeightKg: 68,
      weeklyPaceKg: 0.5,
      dailyCalories: 2100,
    });
  });

  test('PATCH /notification-preferences validates HH:mm time values', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch('/notification-preferences')
      .send({ breakfast: { time: '8:30' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_NOTIFICATION_PREFERENCES_UPDATE');
  });

  test('GET /favorite-recipes returns persisted favorite recipe cards', async () => {
    const app = buildApp();

    const res = await request(app).get('/favorite-recipes');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'fav-1',
        title: 'Lemon Herb Salmon Pasta',
        imageUrl: null,
        emoji: 'pasta',
        kcal: 420,
        prepTimeMinutes: 25,
        proteinG: null,
        carbsG: null,
        fatG: null,
        mealPhotoId: null,
      },
    ]);
  });

  test('POST /favorite-recipes creates a favorite meal (macros, no prep time)', async () => {
    const app = buildApp();

    const res = await request(app).post('/favorite-recipes').send({
      title: 'Greek Yogurt Bowl',
      kcal: 280,
      proteinG: 22,
      carbsG: 24,
      fatG: 9,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 'fav-2',
      title: 'Greek Yogurt Bowl',
      imageUrl: null,
      emoji: null,
      kcal: 280,
      prepTimeMinutes: null,
      proteinG: 22,
      carbsG: 24,
      fatG: 9,
      mealPhotoId: null,
    });
  });

  test('DELETE /favorite-recipes/:id returns 204', async () => {
    const app = buildApp();

    const res = await request(app).delete('/favorite-recipes/fav-1');

    expect(res.status).toBe(204);
  });

  test('GET /my-meals returns persisted saved meal cards', async () => {
    const app = buildApp();

    const res = await request(app).get('/my-meals');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'meal-1',
        title: 'My Protein Omelette',
        imageUrl: null,
        emoji: 'omelette',
        kcal: 340,
        proteinG: 32,
        carbsG: null,
        fatG: null,
        mealPhotoId: null,
      },
    ]);
  });

  test('POST /my-meals creates a new saved meal card', async () => {
    const app = buildApp();

    const res = await request(app).post('/my-meals').send({
      title: 'Turkey Wrap',
      kcal: 410,
      proteinG: 29,
      carbsG: 38,
      fatG: 14,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 'meal-2',
      title: 'Turkey Wrap',
      imageUrl: null,
      emoji: null,
      kcal: 410,
      proteinG: 29,
      carbsG: 38,
      fatG: 14,
      mealPhotoId: null,
    });
  });

  test('PATCH /my-meals/:id updates an existing saved meal', async () => {
    const app = buildApp();

    const res = await request(app).patch('/my-meals/meal-1').send({
      title: 'Updated Omelette',
      proteinG: 35,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'meal-1',
      title: 'Updated Omelette',
      imageUrl: null,
      emoji: 'omelette',
      kcal: 340,
      proteinG: 35,
      carbsG: null,
      fatG: null,
      mealPhotoId: null,
    });
  });

  test('DELETE /my-meals/:id returns 204', async () => {
    const app = buildApp();

    const res = await request(app).delete('/my-meals/meal-1');

    expect(res.status).toBe(204);
  });

  const fullRecipe = {
    title: 'High-protein chicken bowl',
    subtitle: 'Quick weeknight dinner',
    timeMinutes: 20,
    servings: 1,
    calories: 550,
    proteinGrams: 45,
    carbsGrams: 40,
    fatGrams: 18,
    ingredients: [
      { name: 'chicken breast', amount: '150g' },
      { name: 'brown rice', amount: '1 cup cooked' },
    ],
    steps: ['Grill the chicken.', 'Serve over rice with vegetables.'],
    why: 'Hits your remaining protein target for today.',
  };

  test('POST /saved-recipes stores the full recipe and returns 201', async () => {
    const app = buildApp();

    const res = await request(app).post('/saved-recipes').send({ recipe: fullRecipe });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('saved-recipe-1');
    expect(res.body.recipe).toEqual(fullRecipe);
    expect(res.body.imageUrl).toBeNull();
  });

  test('POST /saved-recipes rejects a malformed recipe with 400', async () => {
    const app = buildApp();

    const { steps: _dropped, ...withoutSteps } = fullRecipe;
    const res = await request(app).post('/saved-recipes').send({ recipe: withoutSteps });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SAVED_RECIPE');
  });

  test('GET /saved-recipes returns the stored cards', async () => {
    const app = buildApp();

    await request(app).post('/saved-recipes').send({ recipe: fullRecipe });
    const res = await request(app).get('/saved-recipes');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].recipe.title).toBe('High-protein chicken bowl');
  });

  test('DELETE /saved-recipes/:id returns 204, then 404 when already gone', async () => {
    const app = buildApp();

    const created = await request(app).post('/saved-recipes').send({ recipe: fullRecipe });
    const deleteRes = await request(app).delete(`/saved-recipes/${created.body.id}`);
    expect(deleteRes.status).toBe(204);

    const secondDelete = await request(app).delete(`/saved-recipes/${created.body.id}`);
    expect(secondDelete.status).toBe(404);
    expect(secondDelete.body.error.code).toBe('SAVED_RECIPE_NOT_FOUND');
  });
});
