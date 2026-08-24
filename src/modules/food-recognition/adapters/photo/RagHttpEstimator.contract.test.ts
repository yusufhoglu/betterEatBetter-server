import { ragResponseSchema } from './RagHttpEstimator';
import sufficientFixture from './fixtures/rag-response-sufficient.json';
import insufficientFixture from './fixtures/rag-response-insufficient.json';
import errorFixture from './fixtures/rag-response-error.json';

/**
 * Contract tests for the Python RAG service response schema.
 * These tests validate that our Zod schema correctly parses the expected shapes
 * from the Python service, catching any schema drift early.
 * They do NOT make network calls; they validate against static fixtures.
 */
describe('RagHttpEstimator contract tests', () => {
  describe('sufficient response fixture', () => {
    it('parses successfully and matches completed status', () => {
      const result = ragResponseSchema.safeParse(sufficientFixture);

      expect(result.success).toBe(true);
      if (!result.success || result.data.status !== 'completed') return;

      expect(result.data.status).toBe('completed');
      expect(result.data.estimate.confidenceStatus).toBe('sufficient');
      expect(result.data.estimate.items.length).toBeGreaterThan(0);
    });

    it('all items have required nutritional fields', () => {
      const result = ragResponseSchema.safeParse(sufficientFixture);
      expect(result.success).toBe(true);
      if (!result.success || result.data.status !== 'completed') return;

      for (const item of result.data.estimate.items) {
        expect(typeof item.name).toBe('string');
        expect(typeof item.confidence).toBe('number');
        expect(typeof item.portionGrams).toBe('number');
        expect(typeof item.calories).toBe('number');
        expect(typeof item.proteinG).toBe('number');
        expect(typeof item.carbsG).toBe('number');
        expect(typeof item.fatG).toBe('number');
      }
    });
  });

  describe('insufficient_data response fixture', () => {
    it('parses successfully and matches completed plus insufficient_data', () => {
      const result = ragResponseSchema.safeParse(insufficientFixture);

      expect(result.success).toBe(true);
      if (!result.success || result.data.status !== 'completed') return;

      expect(result.data.status).toBe('completed');
      expect(result.data.estimate.confidenceStatus).toBe('insufficient_data');
      expect(result.data.estimate.items).toHaveLength(0);
    });
  });

  describe('error response fixture', () => {
    it('parses successfully as a failed response shape', () => {
      const result = ragResponseSchema.safeParse(errorFixture);

      expect(result.success).toBe(true);
      if (!result.success || result.data.status !== 'failed') return;

      expect(result.data.error.code).toBeDefined();
      expect(typeof result.data.error.message).toBe('string');
    });
  });

  describe('schema rejection', () => {
    it('rejects a response missing the status field', () => {
      const result = ragResponseSchema.safeParse({ requestId: 'r1', estimate: { items: [] } });
      expect(result.success).toBe(false);
    });

    it('rejects a response with an unknown status value', () => {
      const result = ragResponseSchema.safeParse({
        requestId: 'r1',
        status: 'unknown_value',
        processingTimeMs: 12,
      });
      expect(result.success).toBe(false);
    });
  });
});
