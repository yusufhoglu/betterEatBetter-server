process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.REDIS_CACHE_URL ??= 'redis://localhost:6380';
process.env.R2_ACCOUNT_ID ??= 'test-account';
process.env.R2_ACCESS_KEY_ID ??= 'test-key';
process.env.R2_SECRET_ACCESS_KEY ??= 'test-secret';
process.env.R2_BUCKET_NAME ??= 'test-bucket';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-characters-long';
process.env.RAG_SERVICE_URL ??= 'http://localhost:9999';
// food-recognition module defaults for test environment
process.env.LLM_SERVICE_URL ??= 'http://localhost:11434';
process.env.OPEN_FOOD_FACTS_URL ??= 'https://world.openfoodfacts.org';
process.env.MAX_PHOTO_SIZE_BYTES ??= String(10 * 1024 * 1024);
process.env.PHOTO_WORKER_CONCURRENCY ??= '2';
// shared/llm module defaults for test environment
process.env.LLM_PROVIDER ??= 'openai';
process.env.OPENAI_API_KEY ??= 'test-key-not-real';

