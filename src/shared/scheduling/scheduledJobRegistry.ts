import type { BaseJobPayload } from '../queue/jobTypes';
import type { ScheduledJobDefinition } from './cronRunner';

type AnyScheduledJobDefinition = ScheduledJobDefinition<BaseJobPayload>;

const registry: AnyScheduledJobDefinition[] = [];

/** No real scheduled job exists yet — modules register theirs here once their rule docs land. */
export function registerScheduledJob(definition: AnyScheduledJobDefinition): void {
  registry.push(definition);
}

export function getRegisteredScheduledJobs(): readonly AnyScheduledJobDefinition[] {
  return registry;
}
