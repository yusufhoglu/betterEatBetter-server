-- dietician module: a goal-oriented coaching conversation over two model tiers.
-- Mirrors chatbot's conversations/messages, plus a rolling structured `digest`
-- that stands in for messages trimmed out of the LLM context window.

-- CreateTable
CREATE TABLE "dietician_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "digest" JSONB,
    "digestTurn" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dietician_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietician_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'live',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dietician_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dietician_conversations_userId_idx" ON "dietician_conversations"("userId");

-- CreateIndex
CREATE INDEX "dietician_messages_conversationId_createdAt_idx" ON "dietician_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "dietician_messages" ADD CONSTRAINT "dietician_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "dietician_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
