import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { customFoodInputSchema, mealPlanInputSchema, planHeaderSchema, type MealPlan } from '../domain/mealPlan';
import type { MealPlans } from '../use-cases/MealPlans';

const clientParamsSchema = z.object({ clientId: z.string().uuid() });
const foodParamsSchema = z.object({ foodId: z.string().uuid() });
const foodQuerySchema = z.object({ q: z.string().max(100).default('') });

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }
  return parsed.data;
}

type Handler = (req: Request, res: Response) => Promise<void>;

function handle(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}

function present(plan: MealPlan) {
  return {
    id: plan.id,
    title: plan.title,
    notes: plan.notes,
    meals: plan.meals,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export class MealPlanController {
  constructor(private readonly mealPlans: MealPlans) {}

  // ─── dietitian → client plan ───────────────────────────────────────────
  handleGetClientPlan = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const plan = await this.mealPlans.getForClient(req.auth!.userId, clientId);
    res.status(200).json({ plan: plan ? present(plan) : null });
  });

  handleSaveClientPlan = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const input = parseOrThrow(mealPlanInputSchema, req.body);
    res.status(200).json({ plan: present(await this.mealPlans.save(req.auth!.userId, clientId, input)) });
  });

  handleDeleteClientPlan = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    await this.mealPlans.remove(req.auth!.userId, clientId);
    res.status(204).end();
  });

  // ─── client side ───────────────────────────────────────────────────────
  handleGetMyPlan = handle(async (req, res) => {
    const plan = await this.mealPlans.getMine(req.auth!.userId);
    res.status(200).json({ plan: plan ? present(plan) : null });
  });

  // ─── header ────────────────────────────────────────────────────────────
  handleGetHeader = handle(async (req, res) => {
    res.status(200).json(await this.mealPlans.getHeader(req.auth!.userId));
  });

  handleSaveHeader = handle(async (req, res) => {
    const header = parseOrThrow(planHeaderSchema, req.body);
    res.status(200).json(await this.mealPlans.saveHeader(req.auth!.userId, header));
  });

  // ─── foods ─────────────────────────────────────────────────────────────
  handleSearchFoods = handle(async (req, res) => {
    const { q } = parseOrThrow(foodQuerySchema, req.query);
    res.status(200).json({ items: await this.mealPlans.searchFoods(req.auth!.userId, q) });
  });

  handleCreateFood = handle(async (req, res) => {
    const input = parseOrThrow(customFoodInputSchema, req.body);
    res.status(201).json(await this.mealPlans.createFood(req.auth!.userId, input));
  });

  handleUpdateFood = handle(async (req, res) => {
    const { foodId } = parseOrThrow(foodParamsSchema, req.params);
    const input = parseOrThrow(customFoodInputSchema, req.body);
    res.status(200).json(await this.mealPlans.updateFood(req.auth!.userId, foodId, input));
  });

  handleDeleteFood = handle(async (req, res) => {
    const { foodId } = parseOrThrow(foodParamsSchema, req.params);
    await this.mealPlans.removeFood(req.auth!.userId, foodId);
    res.status(204).end();
  });
}
