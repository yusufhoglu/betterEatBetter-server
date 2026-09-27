-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "stepTarget" INTEGER,
ADD COLUMN     "waterTargetMl" INTEGER;

-- CreateTable
CREATE TABLE "step_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "steps" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "step_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rule_settings" (
    "dietitianId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_settings_pkey" PRIMARY KEY ("dietitianId","ruleId")
);

-- CreateTable
CREATE TABLE "client_insights" (
    "linkId" TEXT NOT NULL,
    "score" INTEGER,
    "scoreParts" JSONB NOT NULL,
    "alerts" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_insights_pkey" PRIMARY KEY ("linkId")
);

-- CreateIndex
CREATE UNIQUE INDEX "step_logs_userId_date_key" ON "step_logs"("userId", "date");

-- AddForeignKey
ALTER TABLE "step_logs" ADD CONSTRAINT "step_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_settings" ADD CONSTRAINT "alert_rule_settings_dietitianId_fkey" FOREIGN KEY ("dietitianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_insights" ADD CONSTRAINT "client_insights_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "dietitian_client_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

