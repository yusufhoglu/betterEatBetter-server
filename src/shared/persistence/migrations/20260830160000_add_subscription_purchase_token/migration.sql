-- Correlation key for reconciling Google Play RTDN webhook notifications
-- (which carry purchaseToken + productId, not our internal userId) back to
-- the row a client's POST /subscription/purchase call created.

ALTER TABLE "subscriptions" ADD COLUMN "purchaseToken" TEXT;

CREATE UNIQUE INDEX "subscriptions_purchaseToken_key" ON "subscriptions" ("purchaseToken");
