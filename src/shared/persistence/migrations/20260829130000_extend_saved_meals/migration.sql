-- Richer saved meals: full macros + a re-signable reference to the source
-- meal photo when saved from the Social feed.

ALTER TABLE "saved_meals" ADD COLUMN "carbsG" INTEGER;
ALTER TABLE "saved_meals" ADD COLUMN "fatG" INTEGER;
ALTER TABLE "saved_meals" ADD COLUMN "mealPhotoId" TEXT;
ALTER TABLE "saved_meals" ADD COLUMN "mealPhotoOwnerId" TEXT;
