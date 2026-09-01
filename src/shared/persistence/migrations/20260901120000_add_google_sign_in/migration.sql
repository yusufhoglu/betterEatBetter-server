-- Google sign-in (identity module): social users have no password, and we
-- need a unique lookup key for a Google account's stable `sub` claim.

ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "googleSub" TEXT;

CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");
