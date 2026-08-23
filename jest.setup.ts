// Fallback env values so importing shared/config/env.ts (fail-fast validated
// at module load) doesn't crash test files that transitively touch it via
// the logger, error mapper, etc. Tests that need real infra behavior mock it
// explicitly instead of relying on these being live connections.
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
