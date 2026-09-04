// Dev tool: grants (or refreshes) a permanent premium entitlement for one
// user, by upserting a manual `subscriptions` row and invalidating that
// user's cached entitlement so it takes effect immediately.
//
// Usage: npm run grant:premium -- <email>
require('dotenv').config();
require('ts-node/register/transpile-only');

const GRANT_PRODUCT_ID = 'admin_grant';
const GRANT_PROVIDER = 'manual';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run grant:premium -- <email>');
    process.exitCode = 1;
    return;
  }

  const { PrismaClient } = require('@prisma/client');
  const { cacheRedisClient } = require('../src/shared/cache/redisCacheClient');
  const { premiumEntitlementCacheKey } = require('../src/modules/subscription/entitlement/PremiumStatusCache');

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) {
      console.error(`No user found with email "${email}"`);
      process.exitCode = 1;
      return;
    }

    const existing = await prisma.subscription.findFirst({
      where: { userId: user.id, productId: GRANT_PRODUCT_ID, provider: GRANT_PROVIDER },
    });

    const grantData = {
      status: 'active',
      expiresAt: null, // never expires
      willRenew: false,
      inGracePeriod: false,
    };

    const subscription = existing
      ? await prisma.subscription.update({ where: { id: existing.id }, data: grantData })
      : await prisma.subscription.create({
          data: { userId: user.id, productId: GRANT_PRODUCT_ID, provider: GRANT_PROVIDER, ...grantData },
        });

    // Bypass the up-to-60s entitlement cache so this is visible right away.
    await cacheRedisClient.del(premiumEntitlementCacheKey(user.id));

    console.log(
      JSON.stringify(
        { email: user.email, userId: user.id, subscriptionId: subscription.id, isPremium: true },
        null,
        2,
      ),
    );
  } finally {
    await cacheRedisClient.quit();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
