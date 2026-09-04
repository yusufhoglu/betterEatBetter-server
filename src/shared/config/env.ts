import 'dotenv/config';
import { z } from 'zod';

const LOKI_PUSH_ENDPOINT_SUFFIX = '/loki/api/v1/push';

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

  // identity module — Google Sign-In. Comma-separated list of accepted OAuth
  // client IDs (one per platform: iOS, Android, Web), checked as the audience
  // when verifying a Google ID token.
  GOOGLE_OAUTH_CLIENT_IDS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1)).min(1)),

  RAG_SERVICE_URL: z.string().min(1),

  // food-recognition module settings
  LLM_SERVICE_URL: z.string().url().default('http://localhost:11434'),
  CHATBOT_MODEL: z.string().optional().default('gpt-5-mini'),
  FOOD_TEXT_MODEL: z.string().optional().default('gpt-5-mini'),
  OPEN_FOOD_FACTS_URL: z.string().url().default('https://world.openfoodfacts.org'),
  MAX_PHOTO_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  PHOTO_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  TIMEOUTS_ENABLED: z.coerce.boolean().default(true),
  PHOTO_ESTIMATOR_TIMEOUT_MS: z.coerce.number().int().positive().default(60 * 1000),
  FOOD_ENTRY_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  FOOD_ENTRY_CLEANUP_MAX_AGE_HOURS: z.coerce.number().int().positive().default(24),
  FOOD_ENTRY_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  MAX_TOOL_TURNS: z.coerce.number().int().positive().default(5),
  MAX_CONTEXT_MESSAGES: z.coerce.number().int().positive().default(20),

  // shared/llm model tiers (shared/llm/modelTiers.ts). `cheap` handles the
  // mechanical LLM work (classification, data-gathering, summarization);
  // `prime` is reserved for the user-facing answer that warrants a stronger
  // model. Both are plain provider model ids for the active LLM_PROVIDER.
  LLM_MODEL_CHEAP: z.string().min(1).default('gpt-5-mini'),
  LLM_MODEL_PRIME: z.string().min(1).default('gpt-5'),

  // dietician module — coaching conversation over the two model tiers.
  DIETICIAN_MAX_GATHER_TURNS: z.coerce.number().int().positive().default(3),
  DIETICIAN_DIGEST_EVERY_N_TURNS: z.coerce.number().int().positive().default(6),
  DIETICIAN_MAX_CONTEXT_MESSAGES: z.coerce.number().int().positive().default(20),
  DIETICIAN_RATE_LIMIT_PER_USER: z.coerce.number().int().positive().default(12),
  DIETICIAN_RATE_LIMIT_GLOBAL_FREE: z.coerce.number().int().positive().default(200),
  DIETICIAN_RATE_LIMIT_GLOBAL_PREMIUM: z.coerce.number().int().positive().default(1200),
  // Free-tier daily dietician turns — lower than chat: every advice turn spends
  // a prime-model completion. 0 disables the dietician for free users.
  FREE_DAILY_DIETICIAN_LIMIT: z.coerce.number().int().nonnegative().default(3),

  // Postgres connection pool sizing (appended to DATABASE_URL if absent).
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().default(20),
  DATABASE_POOL_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(20),

  // Global cap on concurrent outbound LLM requests (all features share it).
  // Keeps a burst of users from hammering the provider past its RPM/TPM limit.
  // Premium requests may use LLM_PREMIUM_BURST_SLOTS extra slots and jump the
  // queue ahead of free traffic.
  LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().default(24),
  LLM_PREMIUM_BURST_SLOTS: z.coerce.number().int().nonnegative().default(4),
  LLM_MAX_QUEUE_DEPTH: z.coerce.number().int().positive().default(200),

  // OpenAI SDK internal retry budget (honours Retry-After on 429/5xx).
  OPENAI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),

  // Chat message rate limits (sliding window, 60s). The global ceiling is split
  // into separate free / premium buckets so free load never starves premium.
  CHAT_RATE_LIMIT_PER_USER: z.coerce.number().int().positive().default(20),
  CHAT_RATE_LIMIT_GLOBAL_FREE: z.coerce.number().int().positive().default(400),
  CHAT_RATE_LIMIT_GLOBAL_PREMIUM: z.coerce.number().int().positive().default(2000),

  // Free-tier daily quotas — fixed window on the UTC calendar day. Premium
  // users bypass these entirely. Enforced on top of the burst limits above and
  // gated by RATE_LIMIT_ENABLED. 0 disables the feature for free users.
  FREE_DAILY_PHOTO_LIMIT: z.coerce.number().int().nonnegative().default(1),
  FREE_DAILY_CHAT_LIMIT: z.coerce.number().int().nonnegative().default(7),

  // How long a resolved premium/free entitlement is cached (per user) before
  // re-checking the subscription store.
  ENTITLEMENT_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  // subscription module — Google Play Developer API + Real-time Developer Notifications
  GOOGLE_PLAY_PACKAGE_NAME: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1),
  GOOGLE_PLAY_RTDN_AUDIENCE: z.string().min(1),

  // notifications module — push delivery + scheduled jobs. All optional; the
  // credential vars become required only when NOTIFICATIONS_ENABLED (see the
  // superRefine block below), the same way LOKI_* are conditionally required.
  // Not z.coerce.boolean() — that coerces the string "false" to true. This
  // switch must default OFF and only turn on for an explicit "true".
  NOTIFICATIONS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FCM_PROJECT_ID: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_AUTH_KEY: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  // Local wall-clock hour (0-23) the streak-saver nudge fires at.
  STREAK_SAVER_LOCAL_HOUR: z.coerce.number().int().min(0).max(23).default(21),
  // Weekly report: local weekday (0 = Sunday .. 6 = Saturday) and hour it fires.
  WEEKLY_REPORT_WEEKDAY: z.coerce.number().int().min(0).max(6).default(1),
  WEEKLY_REPORT_LOCAL_HOUR: z.coerce.number().int().min(0).max(23).default(9),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOKI_URL: z.string().url().optional(),
  LOKI_USER_ID: z.string().optional(),
  LOKI_API_TOKEN: z.string().optional(),

  // shared/llm — provider-agnostic LLM client (see shared/llm/llmClientFactory.ts).
  LLM_PROVIDER: z.enum(['openai', 'anthropic']),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional().default('gpt-5-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60 * 1000),
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
  // No notifications-specific check here: push goes through FCM, whose
  // credentials resolve via GoogleAuth (inline FCM_SERVICE_ACCOUNT_JSON,
  // GOOGLE_APPLICATION_CREDENTIALS, gcloud ADC, or the GCP metadata server), so
  // there is no single env var that must be present when NOTIFICATIONS_ENABLED.
  if (data.LOKI_URL) {
    if (data.LOKI_URL.endsWith(LOKI_PUSH_ENDPOINT_SUFFIX)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOKI_URL'],
        message: `LOKI_URL must be the Loki base host, not end with '${LOKI_PUSH_ENDPOINT_SUFFIX}'`,
      });
    }
    if (!data.LOKI_USER_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOKI_USER_ID'],
        message: 'LOKI_USER_ID is required when LOKI_URL is set',
      });
    }
    if (!data.LOKI_API_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOKI_API_TOKEN'],
        message: 'LOKI_API_TOKEN is required when LOKI_URL is set',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
