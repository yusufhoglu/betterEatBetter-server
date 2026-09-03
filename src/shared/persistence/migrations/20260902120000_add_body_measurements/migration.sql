-- onboarding-plan module: optional tape-measure circumferences (cm) captured at
-- CompleteOnboarding time. Nullable — the onboarding step is skippable, and the
-- plan falls back to a BMI-based body-fat estimate when they are absent.

ALTER TABLE "user_profiles" ADD COLUMN "waistCm" DOUBLE PRECISION;
ALTER TABLE "user_profiles" ADD COLUMN "neckCm" DOUBLE PRECISION;
ALTER TABLE "user_profiles" ADD COLUMN "hipCm" DOUBLE PRECISION;
-- shoulderCm is not used for body fat — kept for the shoulder-to-waist ratio.
ALTER TABLE "user_profiles" ADD COLUMN "shoulderCm" DOUBLE PRECISION;
