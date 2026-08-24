# Local Development

## 1. Start local infrastructure

This repository includes a Docker Compose file for the local Postgres and Redis instances:

```bash
docker compose up -d
```

Services started by Compose:

- Postgres on `localhost:5432`
- Redis queue on `localhost:6379`
- Redis cache on `localhost:6380`
- MinIO on `localhost:9000` / console `localhost:9001`

## 2. Create your local `.env`

Use `.env.example` as the base:

```bash
cp .env.example .env
```

Then fill in the required secrets:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`

## 3. Important local notes

- The current backend uses Cloudflare R2 directly. MinIO is not wired into the app by default.
- `RAG_SERVICE_URL` must point to a running Python RAG service. That service is not included in this repository.
- If you only need non-photo flows, the backend can start with a placeholder `RAG_SERVICE_URL`, but photo recognition will fail at runtime until the RAG service is available.

## 4. Install dependencies and run

```bash
npm install
npm run dev
```

## 5. Suggested local `.env` baseline

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://app:app@localhost:5432/food_tracking
REDIS_URL=redis://localhost:6379
REDIS_CACHE_URL=redis://localhost:6380

R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET_NAME=food-tracking-photos

JWT_SECRET=replace-this-with-a-random-secret-at-least-32-characters
JWT_ACCESS_TOKEN_TTL_SECONDS=1800
REFRESH_TOKEN_TTL_DAYS=30

RAG_SERVICE_URL=http://localhost:8000

LOG_LEVEL=info

LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o
CHATBOT_MODEL=gpt-4o
FOOD_TEXT_MODEL=gpt-4o-mini
```
