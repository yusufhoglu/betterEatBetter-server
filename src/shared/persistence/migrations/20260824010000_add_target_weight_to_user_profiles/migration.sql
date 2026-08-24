ALTER TABLE "user_profiles"
ADD COLUMN "targetWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "user_profiles"
SET "targetWeightKg" = "weightKg"
WHERE "targetWeightKg" = 0;

ALTER TABLE "user_profiles"
ALTER COLUMN "targetWeightKg" DROP DEFAULT;
