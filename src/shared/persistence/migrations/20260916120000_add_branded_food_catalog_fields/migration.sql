-- Extend food_catalog_items to hold branded/restaurant-chain items alongside the
-- existing USDA generic data. Branded items report macros per serving (a "Whopper"
-- has no natural per-100g figure without a gram weight the source data doesn't give),
-- so we add a basis flag instead of forcing everything into per-100g.

-- CreateEnum
CREATE TYPE "NutritionBasis" AS ENUM ('PER_100G', 'PER_SERVING');

-- RenameColumn (values unchanged, existing USDA rows stay basis=PER_100G via the new column's default)
ALTER TABLE "food_catalog_items" RENAME COLUMN "caloriesPer100g" TO "calories";
ALTER TABLE "food_catalog_items" RENAME COLUMN "proteinPer100g" TO "proteinG";
ALTER TABLE "food_catalog_items" RENAME COLUMN "carbsPer100g" TO "carbsG";
ALTER TABLE "food_catalog_items" RENAME COLUMN "fatPer100g" TO "fatG";

-- AddColumn
ALTER TABLE "food_catalog_items" ADD COLUMN "brand" TEXT;
ALTER TABLE "food_catalog_items" ADD COLUMN "category" TEXT;
ALTER TABLE "food_catalog_items" ADD COLUMN "servingLabel" TEXT;
ALTER TABLE "food_catalog_items" ADD COLUMN "basis" "NutritionBasis" NOT NULL DEFAULT 'PER_100G';
