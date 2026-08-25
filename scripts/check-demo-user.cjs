require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    throw new Error('usage: node scripts/check-demo-user.cjs <email>');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true, plan: true },
  });

  if (!user) {
    throw new Error(`user not found: ${email}`);
  }

  const weights = await prisma.bodyMeasurement.findMany({
    where: { userId: user.id, metric: 'weight' },
    orderBy: { date: 'asc' },
    select: { date: true, value: true },
  });

  const positiveDeltas = [];
  for (let i = 1; i < weights.length; i += 1) {
    const delta = Number((weights[i].value - weights[i - 1].value).toFixed(1));
    if (delta > 0) {
      positiveDeltas.push({
        date: dateKey(weights[i].date),
        delta,
        value: weights[i].value,
      });
    }
  }

  const mealLogs = await prisma.mealLogReadModel.findMany({
    where: {
      userId: user.id,
      date: {
        gte: new Date('2026-08-18T00:00:00.000Z'),
        lte: new Date('2026-08-24T23:59:59.999Z'),
      },
    },
    orderBy: { date: 'asc' },
  });

  const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const actual = new Map(orderedDays.map((day) => [day, 0]));
  for (const log of mealLogs) {
    const weekday = orderedDays[(log.date.getUTCDay() + 6) % 7];
    const total = log.entries.reduce((sum, entry) => sum + (entry.calories || 0), 0);
    actual.set(weekday, (actual.get(weekday) || 0) + total);
  }

  console.log(
    JSON.stringify(
      {
        user,
        positiveDeltaCount: positiveDeltas.length,
        samplePositiveDeltas: positiveDeltas.slice(0, 10),
        last10Weights: weights.slice(-10),
        weeklyCaloriesTarget: user.plan?.dailyCalories ?? null,
        weeklyCaloriesActual: orderedDays.map((day) => Math.round(actual.get(day) || 0)),
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
