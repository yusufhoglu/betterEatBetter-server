import { ragResponseSchema } from './RagHttpEstimator';
import sufficientFixture from './fixtures/rag-response-sufficient.json';
import insufficientFixture from './fixtures/rag-response-insufficient.json';
import errorFixture from './fixtures/rag-response-error.json';

/**
 * Contract tests for the Python RAG service response schema.
 * These tests validate that our Zod schema correctly parses the expected shapes
 * from the Python service, catching any schema drift early.
 * They do NOT make network calls — they validate against static fixtures.
 */
describe('RagHttpEstimator — contract tests', () => {
  describe('sufficient response fixture', () => {
    it('parses successfully and matches sufficient status', () => {
      const result = ragResponseSchema.safeParse(sufficientFixture);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect('status' in result.data).toBe(true);
      if (!('status' in result.data)) return;

      expect(result.data.status).toBe('sufficient');
      expect(result.data.items.length).toBeGreaterThan(0);
      expect(result.data.macros.totalCalories).toBeGreaterThan(0);
    });

    it('all items have required nutritional fields', () => {
      const result = ragResponseSchema.safeParse(sufficientFixture);
      expect(result.success).toBe(true);
      if (!result.success) return;
      if (!('items' in result.data)) return;

      for (const item of result.data.items) {
        expect(typeof item.name).toBe('string');
        expect(typeof item.portionGrams).toBe('number');
        expect(typeof item.calories).toBe('number');
        expect(typeof item.proteinGrams).toBe('number');
        expect(typeof item.carbsGrams).toBe('number');
        expect(typeof item.fatGrams).toBe('number');
      }
    });
  });

  describe('insufficient_data response fixture', () => {
    it('parses successfully and matches insufficient_data status', () => {
      const result = ragResponseSchema.safeParse(insufficientFixture);

      expect(result.success).toBe(true);
      if (!result.success) return;
      if (!('status' in result.data)) return;

      expect(result.data.status).toBe('insufficient_data');
      expect(result.data.items).toHaveLength(0);
    });
  });

  describe('error response fixture', () => {
    it('parses successfully as an error response shape', () => {
      const result = ragResponseSchema.safeParse(errorFixture);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect('error' in result.data).toBe(true);
      if (!('error' in result.data)) return;

      expect(typeof result.data.error).toBe('string');
    });
  });

  describe('schema rejection', () => {
    it('rejects a response missing the status field', () => {
      const result = ragResponseSchema.safeParse({ items: [], macros: {} });
      expect(result.success).toBe(false);
    });

    it('rejects a response with an unknown status value', () => {
      const result = ragResponseSchema.safeParse({
        status: 'unknown_value',
        items: [],
        macros: { totalCalories: 0, totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0 },
      });
      expect(result.success).toBe(false);
    });
  });
});
