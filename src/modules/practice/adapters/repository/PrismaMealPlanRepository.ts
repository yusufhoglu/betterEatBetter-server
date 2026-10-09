import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  mealPlanMealSchema,
  planHeaderSchema,
  type CustomFood,
  type CustomFoodInput,
  type MealPlan,
  type MealPlanInput,
  type PlanHeader,
} from '../../domain/mealPlan';
import type { MealPlanRepositoryPort } from '../../ports/MealPlanRepositoryPort';

type PlanRow = Prisma.MealPlanGetPayload<object>;
type FoodRow = Prisma.DietitianFoodGetPayload<object>;

function toPlan(row: PlanRow): MealPlan {
  const meals = z.array(mealPlanMealSchema).safeParse(row.meals);
  return {
    id: row.id,
    linkId: row.linkId,
    dietitianId: row.dietitianId,
    title: row.title,
    notes: row.notes,
    // Written through the same schema; a row that no longer parses reads as empty rather than 500ing.
    meals: meals.success ? meals.data : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFood(row: FoodRow): CustomFood {
  return {
    id: row.id,
    dietitianId: row.dietitianId,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
  };
}

export class PrismaMealPlanRepository implements MealPlanRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findPlanByLink(linkId: string): Promise<MealPlan | null> {
    const row = await this.prisma.mealPlan.findUnique({ where: { linkId } });
    return row ? toPlan(row) : null;
  }

  async savePlan(linkId: string, dietitianId: string, input: MealPlanInput): Promise<MealPlan> {
    const data = { dietitianId, title: input.title, notes: input.notes, meals: input.meals as Prisma.InputJsonValue };
    const row = await this.prisma.mealPlan.upsert({
      where: { linkId },
      create: { linkId, ...data },
      update: data,
    });
    return toPlan(row);
  }

  async deletePlan(linkId: string): Promise<void> {
    await this.prisma.mealPlan.deleteMany({ where: { linkId } });
  }

  async findHeader(dietitianId: string): Promise<PlanHeader | null> {
    const row = await this.prisma.dietitianProfile.findUnique({
      where: { userId: dietitianId },
      select: { planHeader: true },
    });
    const parsed = planHeaderSchema.safeParse(row?.planHeader);
    return parsed.success ? parsed.data : null;
  }

  async saveHeader(dietitianId: string, header: PlanHeader): Promise<PlanHeader> {
    await this.prisma.dietitianProfile.update({
      where: { userId: dietitianId },
      data: { planHeader: header as Prisma.InputJsonValue },
    });
    return header;
  }

  async searchCustomFoods(dietitianId: string, query: string, limit: number): Promise<CustomFood[]> {
    const rows = await this.prisma.dietitianFood.findMany({
      where: { dietitianId, ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}) },
      orderBy: query ? { name: 'asc' } : { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toFood);
  }

  async findCustomFood(id: string): Promise<CustomFood | null> {
    const row = await this.prisma.dietitianFood.findUnique({ where: { id } });
    return row ? toFood(row) : null;
  }

  async createCustomFood(dietitianId: string, input: CustomFoodInput): Promise<CustomFood> {
    return toFood(await this.prisma.dietitianFood.create({ data: { dietitianId, ...input } }));
  }

  async updateCustomFood(id: string, input: CustomFoodInput): Promise<CustomFood> {
    return toFood(await this.prisma.dietitianFood.update({ where: { id }, data: input }));
  }

  async deleteCustomFood(id: string): Promise<void> {
    await this.prisma.dietitianFood.deleteMany({ where: { id } });
  }
}
