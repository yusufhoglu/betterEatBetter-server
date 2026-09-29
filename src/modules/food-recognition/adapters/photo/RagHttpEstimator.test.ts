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

    await expect(estimator.estimate('https://example.com/photo.jpg', 'en')).rejects.toEqual(
      expect.objectContaining<Partial<IntegrationError>>({
        code: 'RAG_PROCESSING_ERROR',
        retryable: false,
        message:
          "[MODEL_ERROR] int() argument must be a string, a bytes-like object or a real number, not 'tuple' (requestId: req-error-1)",
      }),
    );
  });

  it('sends the meal photo id as Idempotency-Key and requestId so retries are not paid twice', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'photo-123',
        status: 'failed',
        error: { code: 'IMAGE_UNREADABLE', message: 'blurry' },
        processingTimeMs: 5,
      }),
    } as Response);
    global.fetch = fetchMock;

    await new RagHttpEstimator('http://rag-service.test').estimate('https://example.com/p.jpg', 'tr', 'photo-123').catch(() => undefined);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('photo-123');
    expect(JSON.parse(init.body as string)).toMatchObject({ requestId: 'photo-123', imageUrl: 'https://example.com/p.jpg' });
  });

  it('omits the Idempotency-Key header when no key is given', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ requestId: 'x', status: 'failed', error: { code: 'MODEL_ERROR', message: 'm' }, processingTimeMs: 1 }),
    } as Response);
    global.fetch = fetchMock;

    await new RagHttpEstimator('http://rag-service.test').estimate('https://example.com/p.jpg', 'en').catch(() => undefined);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers as Record<string, string>).not.toHaveProperty('Idempotency-Key');
  });
});
