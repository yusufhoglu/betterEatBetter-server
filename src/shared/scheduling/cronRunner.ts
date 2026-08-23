import type { Queue } from 'bullmq';
import type { BaseJobPayload } from '../queue/jobTypes';

export interface ScheduledJobDefinition<PayloadT extends BaseJobPayload> {
  /**
   * Required (not optional) by this signature: a fixed jobId is what lets
   * BullMQ's own dedup mechanism stop the same repeatable job from firing
   * more than once when multiple Node instances are running.
   */
  jobId: string;
  /** Cron pattern, e.g. "every 15 minutes". */
  pattern: string;
  payload: PayloadT;
}

export async function registerRepeatableJob<PayloadT extends BaseJobPayload>(
  queue: Queue<PayloadT, void, string>,
  definition: ScheduledJobDefinition<PayloadT>,
): Promise<void> {
  // BullMQ resolves Queue.add()'s name/data parameter types via conditional
  // types keyed off the queue's own generic — they never resolve for a still-
  // generic PayloadT inside this wrapper (only at concrete call sites). Type
  // safety for callers is enforced above via ScheduledJobDefinition<PayloadT>;
  // this narrows just the .add() call to bullmq's own permissive shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genericQueue = queue as unknown as Queue<any, any, string>;

  await genericQueue.add(definition.jobId, definition.payload, {
    jobId: definition.jobId,
    repeat: { pattern: definition.pattern },
  });
}
