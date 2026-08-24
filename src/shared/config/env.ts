import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),

  // BullMQ dedicated connection — must stay separate from the cache client.
  REDIS_URL: z.string().min(1),
  REDIS_CACHE_URL: z.string().min(1),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  RAG_SERVICE_URL: z.string().min(1),

  // food-recognition module settings
  LLM_SERVICE_URL: z.string().url().default('http://localhost:11434'),
  CHATBOT_MODEL: z.string().optional().default('gpt-4o'),
  FOOD_TEXT_MODEL: z.string().optional().default('gpt-4o-mini'),
  OPEN_FOOD_FACTS_URL: z.string().url().default('https://world.openfoodfacts.org'),
  MAX_PHOTO_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  PHOTO_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  FOOD_ENTRY_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  FOOD_ENTRY_CLEANUP_MAX_AGE_HOURS: z.coerce.number().int().positive().default(24),
  FOOD_ENTRY_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  MAX_TOOL_TURNS: z.coerce.number().int().positive().default(5),
  MAX_CONTEXT_MESSAGES: z.coerce.number().int().positive().default(20),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOKI_URL: z.string().url().optional(),
  LOKI_USER_ID: z.string().optional(),
  LOKI_API_TOKEN: z.string().optional(),

  // shared/llm — provider-agnostic LLM client (see shared/llm/llmClientFactory.ts).
  LLM_PROVIDER: z.enum(['openai', 'anthropic']),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional().default('gpt-4o'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional().default('claude-sonnet-4-6'),
}).superRefine((data, ctx) => {
  // Only the selected provider's key is mandatory — the other provider's key
  // stays optional, since a deployment only ever calls the one it configured.
  if (data.LLM_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: "OPENAI_API_KEY is required when LLM_PROVIDER='openai'",
    });
  }
  if (data.LLM_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANTHROPIC_API_KEY'],
      message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER='anthropic'",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
