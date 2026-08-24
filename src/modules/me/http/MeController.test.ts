import express from 'express';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { errorMapperMiddleware } from '../../../shared/errors/errorMapper';
import { MeController } from './MeController';

function buildApp() {
  const favoriteRecipes: Array<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    prepTimeMinutes: number;
  }> = [
    {
      id: 'fav-1',
      title: 'Lemon Herb Salmon Pasta',
      imageUrl: null,
      emoji: 'pasta',
      kcal: 420,
      prepTimeMinutes: 25,
    },
  ];
  const myMeals: Array<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    proteinG: number;
  }> = [
    {
      id: 'meal-1',
      title: 'My Protein Omelette',
      imageUrl: null,
      emoji: 'omelette',
      kcal: 340,
      proteinG: 32,
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
        prepTimeMinutes: number;
      }) => {
        const created = {
          id: 'fav-2',
          title: input.title,
          imageUrl: input.imageUrl ?? null,
          emoji: input.emoji ?? null,
          kcal: input.kcal,
          prepTimeMinutes: input.prepTimeMinutes,
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
      }) => {
        const created = {
          id: 'meal-2',
          title: input.title,
          imageUrl: input.imageUrl ?? null,
          emoji: input.emoji ?? null,
          kcal: input.kcal,
          proteinG: input.proteinG,
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
      },
    ]);
  });

  test('POST /favorite-recipes creates a new favorite recipe card', async () => {
    const app = buildApp();

    const res = await request(app).post('/favorite-recipes').send({
      title: 'Greek Yogurt Bowl',
      kcal: 280,
      prepTimeMinutes: 5,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 'fav-2',
      title: 'Greek Yogurt Bowl',
      imageUrl: null,
      emoji: null,
      kcal: 280,
      prepTimeMinutes: 5,
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
      },
    ]);
  });

  test('POST /my-meals creates a new saved meal card', async () => {
    const app = buildApp();

    const res = await request(app).post('/my-meals').send({
      title: 'Turkey Wrap',
      kcal: 410,
      proteinG: 29,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 'meal-2',
      title: 'Turkey Wrap',
      imageUrl: null,
      emoji: null,
      kcal: 410,
      proteinG: 29,
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
    });
  });

  test('DELETE /my-meals/:id returns 204', async () => {
    const app = buildApp();

    const res = await request(app).delete('/my-meals/meal-1');

    expect(res.status).toBe(204);
  });
});
