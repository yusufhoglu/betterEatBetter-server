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
  OPEN_FOOD_FACTS_URL: z.string().url().default('https://world.openfoodfacts.org'),
  MAX_PHOTO_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  PHOTO_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
