import { FakeDailyTargetsPort } from '../../../nutrition-logging/test-utils/fakes/FakeDailyTargetsPort';
import { InMemoryMealItemRepository } from '../../../nutrition-logging/test-utils/fakes/InMemoryMealItemRepository';
import { GetDayNutrientTotals } from '../../../nutrition-logging/use-cases/GetDayNutrientTotals';
import { GetLoggedMealTypesForDateRange } from '../../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { DieticianMealDataTool } from './DieticianMealDataTool';

function buildTool() {
  const repository = new InMemoryMealItemRepository();
  const dailyTargetsPort = new FakeDailyTargetsPort();
  const tool = new DieticianMealDataTool(
    new GetDayNutrientTotals(repository, dailyTargetsPort),
    new GetLoggedMealTypesForDateRange(repository),
  );
  return { tool, repository, dailyTargetsPort };
}

describe('DieticianMealDataTool', () => {
  it('returns day nutrient totals (consumed + targets + remaining) via the real use-case for "date"', async () => {
    const { tool, repository, dailyTargetsPort } = buildTool();
    dailyTargetsPort.setTargets('user-1', { calories: 2000, proteinG: 150, carbsG: 200, fatG: 70 });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-09-03T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [{ id: 'e1', name: 'Chicken', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 }],
    });

    const result = (await tool.execute('user-1', { date: '2026-09-03' })) as {
      consumed: { calories: number };
      remainingCalories: number | null;
      loggedMealTypes: string[];
    };

    expect(result.consumed.calories).toBe(320);
    expect(result.remainingCalories).toBe(1680);
    expect(result.loggedMealTypes).toEqual(['lunch']);
  });

  it('returns logged meal types via the real use-case for a range', async () => {
    const { tool, repository } = buildTool();
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-09-03T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [{ id: 'e1', name: 'Oats', portionGrams: 80, calories: 300, proteinG: 10, carbsG: 50, fatG: 5 }],
    });

    const result = await tool.execute('user-1', { startDate: '2026-09-01', endDate: '2026-09-05' });

    expect(result).toEqual({ '2026-09-03': ['breakfast'] });
  });

  it('throws for neither date nor a full range', async () => {
    const { tool } = buildTool();
    await expect(tool.execute('user-1', {})).rejects.toThrow();
  });

  it('throws for an unparseable date', async () => {
    const { tool } = buildTool();
    await expect(tool.execute('user-1', { date: 'not-a-date' })).rejects.toThrow();
  });

  it('exposes a get_meal_data tool definition', () => {
    const { tool } = buildTool();
    expect(tool.definition.name).toBe('get_meal_data');
    expect(tool.definition.inputSchema).toMatchObject({ type: 'object' });
  });
});
