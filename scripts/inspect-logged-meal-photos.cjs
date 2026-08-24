const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const userId = process.argv[2];

  if (!userId) {
    throw new Error('usage: node scripts/inspect-logged-meal-photos.cjs <userId>');
  }

  try {
    const [mealItems, foodEntries] = await Promise.all([
      prisma.mealItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.foodEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    console.log(
      JSON.stringify(
        {
          userId,
          mealItems,
          foodEntries,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
