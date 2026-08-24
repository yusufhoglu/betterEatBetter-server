CREATE TABLE "body_measurements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "body_silhouette_profiles" (
    "userId" TEXT NOT NULL,
    "neckCm" DOUBLE PRECISION,
    "shoulderCm" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "hipCm" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_silhouette_profiles_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "meal_log_read_models" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mealType" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_log_read_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meal_log_read_models_userId_date_mealType_key" ON "meal_log_read_models"("userId", "date", "mealType");
CREATE INDEX "body_measurements_userId_metric_date_idx" ON "body_measurements"("userId", "metric", "date");
CREATE INDEX "meal_log_read_models_userId_date_idx" ON "meal_log_read_models"("userId", "date");
