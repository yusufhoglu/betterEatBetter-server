-- Denormalized meal nutrition on the post itself, so the feed can filter by
-- calorie / macro range at the DB level (the source `food_entries.resultJson`
-- is JSON, not queryable). Written at share time from the recognised result,
-- and re-synced whenever the author edits the underlying logged meal.
--
-- NULL = nutrition unknown at share time; such a post is excluded from any
-- macro-filtered feed query.

ALTER TABLE "social_posts" ADD COLUMN "calories" INTEGER;
ALTER TABLE "social_posts" ADD COLUMN "proteinG" INTEGER;
ALTER TABLE "social_posts" ADD COLUMN "carbsG" INTEGER;
ALTER TABLE "social_posts" ADD COLUMN "fatG" INTEGER;

-- Best-effort backfill for the common `resultJson.macros` shape. Posts backed
-- by the item-list shape (or an incomplete result) stay NULL until the author
-- next edits or re-shares the meal.
UPDATE "social_posts" sp SET
  "calories" = ROUND((fe."resultJson" -> 'macros' ->> 'totalCalories')::numeric),
  "proteinG" = ROUND((fe."resultJson" -> 'macros' ->> 'totalProteinGrams')::numeric),
  "carbsG"   = ROUND((fe."resultJson" -> 'macros' ->> 'totalCarbsGrams')::numeric),
  "fatG"     = ROUND((fe."resultJson" -> 'macros' ->> 'totalFatGrams')::numeric)
FROM "food_entries" fe
WHERE fe."id" = sp."mealPhotoId"
  AND fe."status" = 'completed'
  AND (fe."resultJson" -> 'macros' ->> 'totalCalories') IS NOT NULL;

-- Feed filter queries sort by createdAt and narrow on calories; a partial
-- index keeps the common "has nutrition" scan cheap.
CREATE INDEX "social_posts_calories_createdAt_idx"
  ON "social_posts" ("calories", "createdAt")
  WHERE "calories" IS NOT NULL;
