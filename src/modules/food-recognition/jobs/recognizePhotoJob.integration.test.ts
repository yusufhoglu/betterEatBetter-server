import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import { getTraceId } from '../../../shared/observability/tracer';
import type { RecognizePhotoJobPayload } from '../use-cases/RecognizeFromPhoto';
import type { createWorker as CreateWorkerFn } from '../../../shared/queue/queueConnection';

/**
 * Integration test: verifies that createWorker() correctly propagates the
 * traceId from job.data into AsyncLocalStorage so all logs inside the worker
 * automatically carry the correct trace context.
 *
 * This test confirms that shared/queue/queueConnection's createWorker wrapper
 * is wiring trace context correctly for this module.
 *
 * IMPORTANT: `shared/queue/queueConnection` builds its Redis connection once,
 * from `env.REDIS_URL`, at module-load time. `env` itself is parsed once from
 * `process.env` on first import. Setting `process.env.REDIS_URL` in
 * `beforeAll` has no effect on an already-loaded connection, so `createWorker`
 * is imported dynamically here — AFTER the container starts and REDIS_URL is
 * set — instead of via a static top-level import. Each Jest test file gets
 * its own module registry, so this is the first (and only) load of that
 * module in this file.
 */
describe('recognizePhotoJob — trace context integration', () => {
  let container: StartedRedisContainer;
  let redisUrl: string;
  let capturedTraceId: string | undefined;
  let createWorker: typeof CreateWorkerFn;

  const TEST_QUEUE_NAME = 'test-recognize-photo-trace';
  const TEST_TRACE_ID = 'trace-context-test-id-12345';

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    redisUrl = container.getConnectionUrl();

    // Must be set before queueConnection (and the env it reads) is first imported.
    process.env.REDIS_URL = redisUrl;
    ({ createWorker } = await import('../../../shared/queue/queueConnection'));
  }, 60_000);

  afterAll(async () => {
    await container.stop();
  });

  it('sets traceId in AsyncLocalStorage from job.data.traceId inside the worker', async () => {
    const IORedisClass = (await import('ioredis')).default;
    const conn = new IORedisClass(redisUrl, { maxRetriesPerRequest: null });

    const queue = new Queue<RecognizePhotoJobPayload>(TEST_QUEUE_NAME, { connection: conn });

    let resolveJob!: () => void;
    const jobProcessed = new Promise<void>((resolve) => {
      resolveJob = resolve;
    });

    // Use createWorker so the trace context propagation is tested — it connects
    // to the same testcontainer Redis since REDIS_URL was set before it was loaded.
    const worker = createWorker<RecognizePhotoJobPayload>(TEST_QUEUE_NAME, async () => {
      // Inside the worker, getTraceId() should return the traceId from job.data
      capturedTraceId = getTraceId();
      resolveJob();
    });

    await queue.add(
      'recognize-photo',
      {
        mealPhotoId: 'test-photo-id',
        userId: 'test-user-id',
        photoObjectKey: 'pending/test-photo-id.jpg',
        traceId: TEST_TRACE_ID,
      },
      { jobId: 'test-photo-id' },
    );

    await jobProcessed;

    expect(capturedTraceId).toBe(TEST_TRACE_ID);

    await worker.close();
    await queue.close();
    await conn.quit();
  }, 30_000);
});
