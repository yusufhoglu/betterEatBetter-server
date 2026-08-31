-- Mirrors the mobile-facing Entitlement contract (see
-- subscription-backend-contract.md): willRenew/inGracePeriod aren't
-- derivable from `status` alone.

ALTER TABLE "subscriptions" ADD COLUMN "willRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscriptions" ADD COLUMN "inGracePeriod" BOOLEAN NOT NULL DEFAULT false;
