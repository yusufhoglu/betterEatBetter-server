/** Every job payload carries at least this — trace context has to travel as data once the request boundary is gone. */
export interface BaseJobPayload {
  traceId: string;
}
