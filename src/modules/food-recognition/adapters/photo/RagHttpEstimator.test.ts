import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { RagHttpEstimator } from './RagHttpEstimator';

describe('RagHttpEstimator', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('includes upstream requestId and error code when the RAG service returns a failed payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'req-error-1',
        status: 'failed',
        error: {
          code: 'MODEL_ERROR',
          message: "int() argument must be a string, a bytes-like object or a real number, not 'tuple'",
        },
        processingTimeMs: 73,
      }),
    } as Response);

    const estimator = new RagHttpEstimator('http://rag-service.test');

    await expect(estimator.estimate('https://example.com/photo.jpg')).rejects.toEqual(
      expect.objectContaining<Partial<IntegrationError>>({
        code: 'RAG_PROCESSING_ERROR',
        retryable: false,
        message:
          "[MODEL_ERROR] int() argument must be a string, a bytes-like object or a real number, not 'tuple' (requestId: req-error-1)",
      }),
    );
  });
});
