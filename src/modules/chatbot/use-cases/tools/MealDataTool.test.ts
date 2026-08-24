import { FakeDailyTargetsPort } from '../../../nutrition-logging/test-utils/fakes/FakeDailyTargetsPort';
import { InMemoryMealItemRepository } from '../../../nutrition-logging/test-utils/fakes/InMemoryMealItemRepository';
import { GetDaySummary } from '../../../nutrition-logging/use-cases/GetDaySummary';
import { GetLoggedMealTypesForDateRange } from '../../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { MealDataTool } from './MealDataTool';

function buildTool() {
  const repository = new InMemoryMealItemRepository();
  const dailyTargetsPort = new FakeDailyTargetsPort();
  const tool = new MealDataTool(
    new GetDaySummary(repository, dailyTargetsPort),
    new GetLoggedMealTypesForDateRange(repository),
  );
  return { tool, repository, dailyTargetsPort };
}

describe('MealDataTool', () => {
  it('returns a day summary via the real GetDaySummary use-case when "date" is provided', async () => {
    const { tool, repository, dailyTargetsPort } = buildTool();
    dailyTargetsPort.setTargets('user-1', { calories: 2000, proteinG: 150, carbsG: 200, fatG: 70 });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-24T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [{ id: 'e1', name: 'Chicken', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 }],
    });

    const result = (await tool.execute('user-1', { date: '2026-08-24' })) as {
      consumed: { calories: number };
      dailyCalorieGoal: number | null;
    };

    expect(result.consumed.calories).toBe(320);
    expect(result.dailyCalorieGoal).toBe(2000);
  });

  it('returns logged meal types via the real GetLoggedMealTypesForDateRange use-case when a range is provided', async () => {
    const { tool, repository } = buildTool();
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-24T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [{ id: 'e1', name: 'Oats', portionGrams: 80, calories: 300, proteinG: 10, carbsG: 50, fatG: 5 }],
    });

    const result = await tool.execute('user-1', { startDate: '2026-08-20', endDate: '2026-08-25' });

    expect(result).toEqual({ '2026-08-24': ['breakfast'] });
  });

  it('throws a taxonomy error when neither date nor a full range is given', async () => {
    const { tool } = buildTool();

    await expect(tool.execute('user-1', {})).rejects.toThrow();
  });

  it('throws a taxonomy error for an unparseable date', async () => {
    const { tool } = buildTool();

    await expect(tool.execute('user-1', { date: 'not-a-date' })).rejects.toThrow();
  });

  it('exposes an LlmToolDefinition-shaped schema named get_meal_data', () => {
    const { tool } = buildTool();

    expect(tool.definition.name).toBe('get_meal_data');
    expect(typeof tool.definition.description).toBe('string');
    expect(tool.definition.inputSchema).toMatchObject({ type: 'object' });
  });
});
