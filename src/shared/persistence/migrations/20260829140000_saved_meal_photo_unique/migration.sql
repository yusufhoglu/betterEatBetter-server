-- One saved meal per (user, source Social photo). Postgres treats NULL
-- mealPhotoId as distinct, so manually-added meals are never blocked.
CREATE UNIQUE INDEX "saved_meals_userId_mealPhotoId_key"
  ON "saved_meals" ("userId", "mealPhotoId");
