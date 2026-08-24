ALTER TABLE "user_profiles"
ADD COLUMN "targetWeightKg" DOUBLE PRECISION;

ALTER TABLE "user_profiles"
ADD COLUMN "initialWeightKg" DOUBLE PRECISION;

UPDATE "user_profiles"
SET
  "targetWeightKg" = "weightKg",
  "initialWeightKg" = "weightKg"
WHERE
  "targetWeightKg" IS NULL
  OR "initialWeightKg" IS NULL;

ALTER TABLE "user_profiles"
ALTER COLUMN "initialWeightKg" SET NOT NULL;
