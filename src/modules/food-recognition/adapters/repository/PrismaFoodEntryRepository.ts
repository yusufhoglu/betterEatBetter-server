import type { PrismaClient } from '@prisma/client';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { FoodEntry, FoodItem, MacroSummary, NutrientAmount, NutrientSummary } from '../../domain/FoodEntry';
import type { FoodEntryRepositoryPort } from '../../ports/FoodEntryRepositoryPort';

const logger = createModuleLogger('food-recognition');
const DAILY_VALUES = {
  vitaminA: 900,
  vitaminC: 90,
  vitaminD: 20,
  calcium: 1300,
  iron: 18,
  potassium: 4700,
  cholesterol: 300,
} as const;

function summarizeMacros(items: FoodItem[]): MacroSummary {
  return items.reduce<MacroSummary>(
    (totals, item) => ({
      totalCalories: totals.totalCalories + item.calories,
      totalProteinGrams: totals.totalProteinGrams + item.proteinGrams,
      totalCarbsGrams: totals.totalCarbsGrams + item.carbsGrams,
      totalFatGrams: totals.totalFatGrams + item.fatGrams,
    }),
    {
      totalCalories: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
    },
  );
}

function toNutrientAmount(amount: number, unit: NutrientAmount['unit'], dailyValue: number): NutrientAmount {
  return {
    amount,
    unit,
    dailyValuePercent: Math.round((amount / dailyValue) * 100),
  };
}

function summarizeNutrients(items: FoodItem[]): NutrientSummary | undefined {
  const vitaminAMcg = items.reduce((total, item) => total + (item.vitaminAMcg ?? 0), 0);
  const vitaminCMg = items.reduce((total, item) => total + (item.vitaminCMg ?? 0), 0);
  const vitaminDMcg = items.reduce((total, item) => total + (item.vitaminDMcg ?? 0), 0);
  const calciumMg = items.reduce((total, item) => total + (item.calciumMg ?? 0), 0);
  const ironMg = items.reduce((total, item) => total + (item.ironMg ?? 0), 0);
  const potassiumMg = items.reduce((total, item) => total + (item.potassiumMg ?? 0), 0);
  const cholesterolMg = items.reduce((total, item) => total + (item.cholesterolMg ?? 0), 0);

  const hasVitaminA = items.some((item) => typeof item.vitaminAMcg === 'number');
  const hasVitaminC = items.some((item) => typeof item.vitaminCMg === 'number');
  const hasVitaminD = items.some((item) => typeof item.vitaminDMcg === 'number');
  const hasCalcium = items.some((item) => typeof item.calciumMg === 'number');
  const hasIron = items.some((item) => typeof item.ironMg === 'number');
  const hasPotassium = items.some((item) => typeof item.potassiumMg === 'number');
  const hasCholesterol = items.some((item) => typeof item.cholesterolMg === 'number');

  const nutrients: NutrientSummary = {};
  if (hasVitaminA) {
    nutrients.vitaminA = toNutrientAmount(vitaminAMcg, 'mcg', DAILY_VALUES.vitaminA);
  }
  if (hasVitaminC) {
    nutrients.vitaminC = toNutrientAmount(vitaminCMg, 'mg', DAILY_VALUES.vitaminC);
  }
  if (hasVitaminD) {
    nutrients.vitaminD = toNutrientAmount(vitaminDMcg, 'mcg', DAILY_VALUES.vitaminD);
  }
  if (hasCalcium) {
    nutrients.calcium = toNutrientAmount(calciumMg, 'mg', DAILY_VALUES.calcium);
  }
  if (hasIron) {
    nutrients.iron = toNutrientAmount(ironMg, 'mg', DAILY_VALUES.iron);
  }
  if (hasPotassium) {
    nutrients.potassium = toNutrientAmount(potassiumMg, 'mg', DAILY_VALUES.potassium);
  }
  if (hasCholesterol) {
    nutrients.cholesterol = toNutrientAmount(cholesterolMg, 'mg', DAILY_VALUES.cholesterol);
  }

  return Object.keys(nutrients).length > 0 ? nutrients : undefined;
}

function parseStoredResult(resultJson: unknown): {
  items: FoodItem[];
  macros: MacroSummary;
  nutrients?: NutrientSummary;
  needsUserAction: boolean;
} | null {
  if (!resultJson || typeof resultJson !== 'object') {
    return null;
  }

  const candidate = resultJson as {
    items?: FoodEntry['items'];
    macros?: FoodEntry['macros'];
    nutrients?: FoodEntry['nutrients'];
    needsUserAction?: boolean;
    estimate?: {
      confidenceStatus?: 'sufficient' | 'insufficient_data';
      items?: Array<{
        name: string;
        portionGrams: number;
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        vitaminAMcg: number;
        vitaminCMg: number;
        vitaminDMcg: number;
        calciumMg: number;
        ironMg: number;
        potassiumMg: number;
        cholesterolMg: number;
      }>;
    };
  };

  if (Array.isArray(candidate.items)) {
    return {
      items: candidate.items,
      macros: candidate.macros ?? summarizeMacros(candidate.items),
      nutrients: candidate.nutrients ?? summarizeNutrients(candidate.items),
      needsUserAction: candidate.needsUserAction ?? false,
    };
  }

  if (candidate.estimate?.items) {
    const items: FoodItem[] = candidate.estimate.items.map((item) => ({
      name: item.name,
      portionGrams: item.portionGrams,
      calories: item.calories,
      proteinGrams: item.proteinG,
      carbsGrams: item.carbsG,
      fatGrams: item.fatG,
      vitaminAMcg: item.vitaminAMcg,
      vitaminCMg: item.vitaminCMg,
      vitaminDMcg: item.vitaminDMcg,
      calciumMg: item.calciumMg,
      ironMg: item.ironMg,
      potassiumMg: item.potassiumMg,
      cholesterolMg: item.cholesterolMg,
    }));

    return {
      items,
      macros: summarizeMacros(items),
      nutrients: summarizeNutrients(items),
      needsUserAction: candidate.estimate.confidenceStatus === 'insufficient_data',
    };
  }

  return null;
}

/**
 * Prisma implementation of FoodEntryRepositoryPort.
 * ONLY used by the photo flow (async). Barcode/text/search do not use this.
 */
export class PrismaFoodEntryRepository implements FoodEntryRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async create(entry: Pick<FoodEntry, 'id' | 'userId' | 'status'>): Promise<void> {
    await this.db.foodEntry.create({
      data: {
        id: entry.id,
        userId: entry.userId,
        status: entry.status,
      },
    });
    logger.debug({ id: entry.id }, 'food_entry created');
  }

  async updateResult(
    id: string,
    update: {
      status: FoodEntry['status'];
      items?: FoodEntry['items'];
      macros?: FoodEntry['macros'];
      needsUserAction?: boolean;
      resultJson?: unknown;
      errorCode?: string;
    },
  ): Promise<void> {
    const resultJson =
      update.resultJson ??
      (update.items
        ? { items: update.items, macros: update.macros, needsUserAction: update.needsUserAction }
        : undefined);

    await this.db.foodEntry.update({
      where: { id },
      data: {
        status: update.status,
        resultJson: resultJson as object | undefined,
        errorCode: update.errorCode ?? null,
      },
    });
    logger.debug({ id, status: update.status }, 'food_entry updated');
  }

  async findById(id: string): Promise<FoodEntry | null> {
    const row = await this.db.foodEntry.findUnique({ where: { id } });
    if (!row) return null;

    const result = parseStoredResult(row.resultJson);

    return {
      id: row.id,
      userId: row.userId,
      source: 'photo',
      status: row.status as FoodEntry['status'],
      items: result?.items ?? [],
      macros: result?.macros ?? {
        totalCalories: 0,
        totalProteinGrams: 0,
        totalCarbsGrams: 0,
        totalFatGrams: 0,
      },
      nutrients: result?.nutrients,
      needsUserAction: result?.needsUserAction ?? false,
      errorCode: row.errorCode ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
