-- AlterTable
ALTER TABLE "dietitian_profiles" ADD COLUMN "planHeader" JSONB;

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "dietitianId" TEXT NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "meals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietitian_foods" (
    "id" TEXT NOT NULL,
    "dietitianId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dietitian_foods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_linkId_key" ON "meal_plans"("linkId");

-- CreateIndex
CREATE INDEX "dietitian_foods_dietitianId_idx" ON "dietitian_foods"("dietitianId");

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "dietitian_client_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
