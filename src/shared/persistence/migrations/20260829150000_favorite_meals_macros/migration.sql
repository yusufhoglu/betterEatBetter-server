-- "Favorite Meals": favorites can now be full meals (macros + a re-signable
-- Social meal-photo reference), not just recipes. prepTimeMinutes is optional.

ALTER TABLE "favorite_recipes" ALTER COLUMN "prepTimeMinutes" DROP NOT NULL;
ALTER TABLE "favorite_recipes" ADD COLUMN "proteinG" INTEGER;
ALTER TABLE "favorite_recipes" ADD COLUMN "carbsG" INTEGER;
ALTER TABLE "favorite_recipes" ADD COLUMN "fatG" INTEGER;
ALTER TABLE "favorite_recipes" ADD COLUMN "mealPhotoId" TEXT;
ALTER TABLE "favorite_recipes" ADD COLUMN "mealPhotoOwnerId" TEXT;

CREATE UNIQUE INDEX "favorite_recipes_userId_mealPhotoId_key"
  ON "favorite_recipes" ("userId", "mealPhotoId");
