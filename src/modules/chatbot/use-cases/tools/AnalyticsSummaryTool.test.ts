import { FakeOnboardingPlanProfilePort } from '../../../body-analytics/test-utils/fakes/FakeOnboardingPlanProfilePort';
import { InMemoryBodyMeasurementRepository } from '../../../body-analytics/test-utils/fakes/InMemoryBodyMeasurementRepository';
import { InMemoryMealLogReadModel } from '../../../body-analytics/test-utils/fakes/InMemoryMealLogReadModel';
import { GetBodyStats } from '../../../body-analytics/use-cases/GetBodyStats';
import { GetMealAverages } from '../../../body-analytics/use-cases/GetMealAverages';
import { AnalyticsSummaryTool } from './AnalyticsSummaryTool';

function buildTool() {
  const measurementRepository = new InMemoryBodyMeasurementRepository();
  const mealLogReadModelRepository = new InMemoryMealLogReadModel();
  const profilePort = new FakeOnboardingPlanProfilePort({
    userId: 'user-1',
    weightKg: 80,
    targetWeightKg: 72,
    initialWeightKg: 85,
    heightCm: 178,
    age: 30,
    gender: 'male',
    workoutsPerWeek: 3,
    goal: 'lose',
    weeklyPaceKg: 0.5,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  const tool = new AnalyticsSummaryTool(
    new GetBodyStats(measurementRepository, profilePort),
    new GetMealAverages(mealLogReadModelRepository),
  );

  return { tool, mealLogReadModelRepository };
}

describe('AnalyticsSummaryTool', () => {
  it("returns body stats via the real GetBodyStats use-case when metric is 'bodyStats'", async () => {
    const { tool } = buildTool();

    const result = (await tool.execute('user-1', { metric: 'bodyStats' })) as { weight: { value: number } };

    expect(result.weight.value).toBe(80);
  });

  it("returns meal averages via the real GetMealAverages use-case when metric is 'mealAverages'", async () => {
    const { tool, mealLogReadModelRepository } = buildTool();
    await mealLogReadModelRepository.upsert({
      userId: 'user-1',
      date: new Date(),
      mealType: 'lunch',
      entries: [{ name: 'Chicken', source: 'manual', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 }],
    });

    const result = (await tool.execute('user-1', { metric: 'mealAverages', range: 'week' })) as { caloriesAvg: number };

    expect(result.caloriesAvg).toBe(320);
  });

  it("defaults to a 'week' range when mealAverages is requested without a range", async () => {
    const { tool, mealLogReadModelRepository } = buildTool();
    await mealLogReadModelRepository.upsert({
      userId: 'user-1',
      date: new Date(),
      mealType: 'dinner',
      entries: [{ name: 'Salmon', source: 'manual', portionGrams: 200, calories: 400, proteinG: 35, carbsG: 5, fatG: 20 }],
    });

    const result = (await tool.execute('user-1', { metric: 'mealAverages' })) as { caloriesAvg: number };

    expect(result.caloriesAvg).toBe(400);
  });

  it('throws a taxonomy error for an unknown metric', async () => {
    const { tool } = buildTool();

    await expect(tool.execute('user-1', { metric: 'unknown' })).rejects.toThrow();
  });

  it('exposes an LlmToolDefinition-shaped schema named get_analytics_summary', () => {
    const { tool } = buildTool();

    expect(tool.definition.name).toBe('get_analytics_summary');
    expect(typeof tool.definition.description).toBe('string');
    expect(tool.definition.inputSchema).toMatchObject({ type: 'object' });
  });
});
