import sufficientFixture from './fixtures/llm-text-estimate-sufficient.json';
import insufficientFixture from './fixtures/llm-text-estimate-insufficient.json';
import { textEstimateSchema } from './LlmTextEstimator';

describe('LlmTextEstimator - contract tests', () => {
  it('parses the sufficient fixture', () => {
    const result = textEstimateSchema.safeParse(sufficientFixture);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.status).toBe('sufficient');
    expect(result.data.items.length).toBeGreaterThan(0);
    expect(result.data.macros.totalCalories).toBeGreaterThan(0);
  });

  it('parses the insufficient_data fixture', () => {
    const result = textEstimateSchema.safeParse(insufficientFixture);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.status).toBe('insufficient_data');
    expect(result.data.items).toHaveLength(0);
  });

  it('rejects an invalid payload that does not match the food-entry shape', () => {
    const result = textEstimateSchema.safeParse({
      status: 'sufficient',
      items: [{ name: 'Rice', calories: 200 }],
      macros: { totalCalories: 200 },
    });

    expect(result.success).toBe(false);
  });
});
