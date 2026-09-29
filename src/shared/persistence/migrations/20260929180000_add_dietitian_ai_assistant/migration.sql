-- AlterTable
ALTER TABLE "dietician_messages" ADD COLUMN "dietitianId" TEXT;

-- CreateTable
CREATE TABLE "dietitian_ai_settings" (
    "dietitianId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultClientAccess" BOOLEAN NOT NULL DEFAULT true,
    "assistantName" TEXT,
    "addressForm" TEXT,
    "tone" TEXT,
    "approach" TEXT,
    "rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "handoffMessage" TEXT,
    "schedule" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dietitian_ai_settings_pkey" PRIMARY KEY ("dietitianId")
);

-- CreateTable
CREATE TABLE "dietitian_ai_examples" (
    "id" TEXT NOT NULL,
    "dietitianId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dietitian_ai_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_ai_settings" (
    "linkId" TEXT NOT NULL,
    "access" TEXT,
    "instructions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_ai_settings_pkey" PRIMARY KEY ("linkId")
);

-- CreateIndex
CREATE INDEX "dietician_messages_dietitianId_createdAt_idx" ON "dietician_messages"("dietitianId", "createdAt");

-- CreateIndex
CREATE INDEX "dietitian_ai_examples_dietitianId_createdAt_idx" ON "dietitian_ai_examples"("dietitianId", "createdAt");

-- CreateIndex
CREATE INDEX "dietitian_ai_examples_sourceMessageId_idx" ON "dietitian_ai_examples"("sourceMessageId");

-- AddForeignKey
ALTER TABLE "dietitian_ai_settings" ADD CONSTRAINT "dietitian_ai_settings_dietitianId_fkey" FOREIGN KEY ("dietitianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dietitian_ai_examples" ADD CONSTRAINT "dietitian_ai_examples_dietitianId_fkey" FOREIGN KEY ("dietitianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_ai_settings" ADD CONSTRAINT "client_ai_settings_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "dietitian_client_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
