import {
  Queue,
  type QueueOptions,
  UnrecoverableError,
  Worker,
  type Processor,
  type WorkerOptions,
} from 'bullmq';
import { IntegrationError } from '../errors/IntegrationError';
import { createModuleLogger } from '../observability/logger';
import { queueJobDurationSeconds } from '../observability/metrics';
import { runWithContext } from '../observability/tracer';
import type { BaseJobPayload } from './jobTypes';
import { queueRedisConnection } from './redisConnection';

const logger = createModuleLogger('queue');

export function createQueue<PayloadT extends BaseJobPayload>(
  name: string,
  options?: Omit<QueueOptions, 'connection'>,
): Queue<PayloadT> {
  return new Queue<PayloadT>(name, { ...options, connection: queueRedisConnection });
}

/**
 * Wraps `processor` so every job file gets trace-context propagation and job
 * duration metrics for free — no worker has to call runWithContext() itself.
 * A non-retryable IntegrationError is converted to BullMQ's UnrecoverableError
 * so the job isn't retried needlessly.
 */
export function createWorker<PayloadT extends BaseJobPayload, ResultT = void>(
  name: string,
  processor: Processor<PayloadT, ResultT>,
  options?: Omit<WorkerOptions, 'connection'>,
): Worker<PayloadT, ResultT> {
  const wrappedProcessor: Processor<PayloadT, ResultT> = (job, token, signal) =>
    runWithContext({ traceId: job.data.traceId }, async () => {
      const stopTimer = queueJobDurationSeconds.startTimer({ queue: name, job_name: job.name });
      try {
        const result = await processor(job, token, signal);
        stopTimer({ status: 'success' });
        return result;
      } catch (err) {
        stopTimer({ status: 'failure' });
        const errorContext =
          err instanceof IntegrationError
            ? {
                err,
                jobId: job.id,
                integrationCode: err.code,
                integrationMessage: err.message,
                integrationRetryable: err.retryable,
                integrationHttpStatus: err.httpStatus,
              }
            : { err, jobId: job.id };
        logger.error(errorContext, 'job processing failed');

        if (err instanceof IntegrationError && !err.retryable) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    });

  return new Worker<PayloadT, ResultT>(name, wrappedProcessor, {
    ...options,
    connection: queueRedisConnection,
  });
}
