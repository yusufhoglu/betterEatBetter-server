import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

export const queueJobDurationSeconds = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Queue job processing duration in seconds',
  labelNames: ['queue', 'job_name', 'status'] as const,
  registers: [metricsRegistry],
});

export const queueDepth = new Gauge({
  name: 'queue_depth',
  help: 'Number of jobs currently waiting in a queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const integrationCallDurationSeconds = new Histogram({
  name: 'integration_call_duration_seconds',
  help: 'Duration of outbound integration calls in seconds',
  labelNames: ['integration', 'outcome'] as const,
  registers: [metricsRegistry],
});

export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open, 3=isolated)',
  labelNames: ['integration'] as const,
  registers: [metricsRegistry],
});

export const nutritionLowConfidenceTotal = new Counter({
  name: 'nutrition_low_confidence_total',
  help: 'Count of nutrition estimations flagged as low confidence',
  labelNames: ['source'] as const,
  registers: [metricsRegistry],
});

export const llmTokensTotal = new Counter({
  name: 'llm_tokens_total',
  help: 'Total LLM tokens consumed, labeled by provider, requesting feature, and token type',
  labelNames: ['provider', 'feature', 'type'] as const,
  registers: [metricsRegistry],
});
