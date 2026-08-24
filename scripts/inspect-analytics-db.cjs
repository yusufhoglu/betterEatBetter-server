require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const [
    users,
    mealItemsCount,
    readModelCount,
    pendingOutboxCount,
    processedOutboxCount,
    recentMealItems,
    recentReadModels,
    recentPendingOutbox,
  ] = await Promise.all([
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, createdAt: true },
    }),
    prisma.mealItem.count(),
    prisma.mealLogReadModel.count(),
    prisma.outboxEvent.count({
      where: {
        processedAt: null,
        eventType: { in: ['meal.logged', 'meal.updated', 'meal.deleted'] },
      },
    }),
    prisma.outboxEvent.count({
      where: {
        processedAt: { not: null },
        eventType: { in: ['meal.logged', 'meal.updated', 'meal.deleted'] },
      },
    }),
    prisma.mealItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.mealLogReadModel.findMany({
      orderBy: { loggedAt: 'desc' },
      take: 5,
    }),
    prisma.outboxEvent.findMany({
      where: {
        processedAt: null,
        eventType: { in: ['meal.logged', 'meal.updated', 'meal.deleted'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        users,
        mealItemsCount,
        readModelCount,
        pendingOutboxCount,
        processedOutboxCount,
        recentMealItems,
        recentReadModels,
        recentPendingOutbox,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
