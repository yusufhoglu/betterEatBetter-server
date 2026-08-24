-- Align the live schema with the current Prisma datamodel for user profile,
-- me, notifications, favorites, saved meals, and subscriptions features.

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "username" TEXT;

-- CreateTable
CREATE TABLE "unit_preferences" (
    "userId" TEXT NOT NULL,
    "weightUnit" TEXT NOT NULL DEFAULT 'kg',
    "heightUnit" TEXT NOT NULL DEFAULT 'cm',
    "energyUnit" TEXT NOT NULL DEFAULT 'kcal',
    "waterUnit" TEXT NOT NULL DEFAULT 'ml',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "masterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "breakfastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "breakfastTime" TEXT NOT NULL DEFAULT '08:30',
    "lunchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lunchTime" TEXT NOT NULL DEFAULT '12:30',
    "dinnerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dinnerTime" TEXT NOT NULL DEFAULT '19:30',
    "waterReminders" BOOLEAN NOT NULL DEFAULT true,
    "streakSaver" BOOLEAN NOT NULL DEFAULT true,
    "weeklyReport" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "favorite_recipes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "emoji" TEXT,
    "kcal" INTEGER NOT NULL,
    "prepTimeMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_meals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "emoji" TEXT,
    "kcal" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorite_recipes_userId_createdAt_idx" ON "favorite_recipes"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "saved_meals_userId_createdAt_idx" ON "saved_meals"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_expiresAt_idx" ON "subscriptions"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_productId_provider_key"
ON "subscriptions"("userId", "productId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "unit_preferences"
ADD CONSTRAINT "unit_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_recipes"
ADD CONSTRAINT "favorite_recipes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_meals"
ADD CONSTRAINT "saved_meals_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions"
ADD CONSTRAINT "subscriptions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
