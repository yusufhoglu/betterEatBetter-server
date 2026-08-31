# syntax=docker/dockerfile:1

# ---- builder: full deps, Prisma client, TypeScript build ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# openssl is required by Prisma's query engine; build-essential/python3 cover
# native addons (argon2, sharp) on the off chance a prebuilt binary is missing.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# Drop dev dependencies but keep the generated Prisma client in node_modules.
RUN npm prune --omit=dev

# ---- runner: slim runtime image ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# schema + migrations so `prisma migrate deploy` can run from this image
COPY --from=builder /app/src/shared/persistence/schema.prisma ./src/shared/persistence/schema.prisma
COPY --from=builder /app/src/shared/persistence/migrations ./src/shared/persistence/migrations

USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]
