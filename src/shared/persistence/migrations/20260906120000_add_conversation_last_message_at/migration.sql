-- Denormalized "last message at" on both conversation tables so the new
-- `GET /chat/conversations` and `GET /dietician/conversations` endpoints can
-- list a user's threads newest-first with a single indexed query, instead of
-- the mobile client having to remember which thread is current.

ALTER TABLE "conversations" ADD COLUMN "lastMessageAt" TIMESTAMP(3);
ALTER TABLE "dietician_conversations" ADD COLUMN "lastMessageAt" TIMESTAMP(3);

-- Backfill from existing messages. A conversation with no messages stays NULL
-- and is excluded from the list endpoints.
UPDATE "conversations" c
SET "lastMessageAt" = (
  SELECT MAX(m."createdAt") FROM "messages" m WHERE m."conversationId" = c."id"
);
UPDATE "dietician_conversations" c
SET "lastMessageAt" = (
  SELECT MAX(m."createdAt") FROM "dietician_messages" m WHERE m."conversationId" = c."id"
);

CREATE INDEX "conversations_userId_lastMessageAt_idx"
  ON "conversations" ("userId", "lastMessageAt" DESC);
CREATE INDEX "dietician_conversations_userId_lastMessageAt_idx"
  ON "dietician_conversations" ("userId", "lastMessageAt" DESC);
