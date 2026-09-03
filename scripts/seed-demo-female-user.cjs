require('dotenv/config');

const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo.analytics.female@eatbetter.app';
const DEMO_PASSWORD = 'DemoFemale123!';
const DEMO_NAME = 'Demo Analytics Female User';
const DEMO_USERNAME = 'demo_analytics_female_2026';
const TODAY = new Date('2026-08-25T00:00:00.000Z');
const LAST_LOG_DATE = new Date('2026-08-24T00:00:00.000Z');
const FIRST_LOG_DATE = new Date('2025-08-25T00:00:00.000Z');

const PLAN_TARGETS = {
  dailyCalories: 1825,
  proteinG: 132,
  carbsG: 190,
  fatG: 61,
};

const PROFILE_BASE = {
  initialWeightKg: 78.4,
  targetWeightKg: 64,
  heightCm: 168,
  age: 29,
  gender: 'female',
  workoutsPerWeek: 4,
  goal: 'lose',
  weeklyPaceKg: 0.25,
};

const favoriteRecipes = [
  { title: 'Berry Yogurt Bowl', emoji: 'berry', kcal: 320, prepTimeMinutes: 5 },
  { title: 'Grilled Chicken Salad', emoji: 'salad', kcal: 430, prepTimeMinutes: 18 },
  { title: 'Salmon Veggie Plate', emoji: 'fish', kcal: 520, prepTimeMinutes: 24 },
  { title: 'Lentil Soup Combo', emoji: 'soup', kcal: 380, prepTimeMinutes: 16 },
];

const savedMeals = [
  { title: 'Balanced Office Lunch', emoji: 'lunch', kcal: 470, proteinG: 35 },
  { title: 'Pilates Recovery Shake', emoji: 'shake', kcal: 260, proteinG: 28 },
  { title: 'Weekend Brunch Plate', emoji: 'brunch', kcal: 610, proteinG: 31 },
];

const breakfastTemplates = [
  {
    name: 'Berry Yogurt Bowl',
    entries: [
      food('Greek Yogurt', 180, 119, 18, 7, 3.2, 0),
      food('Rolled Oats', 40, 156, 6.8, 26.4, 3.2, 4),
      food('Strawberries', 100, 32, 0.7, 7.5, 0.3, 2),
      food('Blueberries', 60, 34, 0.4, 8.5, 0.2, 1.8),
      food('Chia Seeds', 10, 48, 1.7, 4.2, 3.1, 4.1),
    ],
  },
  {
    name: 'Avocado Egg Toast',
    entries: [
      food('Egg', 100, 143, 12.6, 1.1, 9.5, 0),
      food('Whole Wheat Bread', 70, 173, 7, 30, 2.6, 5.3),
      food('Avocado', 55, 88, 1.1, 4.8, 8.2, 3.9),
      food('Tomato', 120, 22, 1.1, 4.8, 0.2, 1.4),
      food('White Cheese', 35, 92, 5.3, 1.4, 7.3, 0),
    ],
  },
  {
    name: 'Protein Overnight Oats',
    entries: [
      food('Rolled Oats', 50, 194, 8, 33, 4, 5),
      food('Skim Milk', 200, 68, 6.8, 10, 0.4, 0),
      food('Whey Protein', 25, 98, 20, 2.5, 1.2, 0),
      food('Banana', 90, 80, 0.9, 20.5, 0.3, 2.3),
      food('Peanut Butter', 12, 71, 3, 2.2, 6, 0.8),
    ],
  },
];

const lunchTemplates = [
  {
    name: 'Chicken Salad Bowl',
    entries: [
      food('Grilled Chicken Breast', 140, 232, 43.7, 0, 4.9, 0),
      food('Quinoa', 150, 180, 6.5, 31.5, 2.9, 4),
      food('Mixed Greens', 90, 18, 1.5, 3.2, 0.2, 1.7),
      food('Avocado', 50, 80, 1, 4.5, 7.4, 3.6),
      food('Olive Oil', 7, 63, 0, 0, 7, 0),
    ],
  },
  {
    name: 'Turkey Wrap',
    entries: [
      food('Whole Wheat Tortilla', 65, 179, 5.7, 30, 4.1, 4.9),
      food('Turkey Breast', 130, 176, 35.8, 0, 3.2, 0),
      food('Hummus', 35, 92, 2.8, 7.8, 5.1, 2.9),
      food('Cucumber & Greens', 90, 15, 0.9, 2.9, 0.2, 1.2),
      food('Apple', 140, 73, 0.4, 19.6, 0.3, 3.6),
    ],
  },
  {
    name: 'Lentil Soup Combo',
    entries: [
      food('Red Lentil Soup', 280, 238, 14, 35, 5.6, 8.4),
      food('Whole Wheat Bread', 60, 148, 6, 25.8, 2.2, 4.5),
      food('Greek Yogurt', 120, 80, 12, 4.8, 2.4, 0),
      food('Side Salad', 100, 24, 1.2, 4.8, 0.3, 1.8),
    ],
  },
];

const dinnerTemplates = [
  {
    name: 'Salmon Veggie Plate',
    entries: [
      food('Salmon Fillet', 145, 297, 30.8, 0, 18.5, 0),
      food('Sweet Potato', 180, 155, 3, 36, 0.2, 5.3),
      food('Broccoli', 150, 51, 4.2, 10, 0.6, 4.5),
      food('Olive Oil', 6, 54, 0, 0, 6, 0),
    ],
  },
  {
    name: 'Meatball Bulgur Plate',
    entries: [
      food('Lean Beef Meatballs', 135, 257, 28.5, 6, 12.8, 0),
      food('Bulgur Pilaf', 170, 189, 5.4, 40.2, 1.6, 7),
      food('Cacik', 120, 72, 4.2, 6, 3.2, 0),
      food('Shepherd Salad', 160, 57, 1.8, 8.8, 2, 2.8),
    ],
  },
  {
    name: 'Chicken Pasta Night',
    entries: [
      food('Chicken Thigh', 140, 255, 28, 0, 14.8, 0),
      food('Whole Wheat Pasta', 160, 198, 8.4, 39.6, 1.6, 6.1),
      food('Tomato Sauce', 100, 48, 1.7, 9, 1, 2.1),
      food('Parmesan', 14, 61, 5.4, 0.5, 4.1, 0),
      food('Zucchini', 120, 21, 1.5, 3.8, 0.4, 1.3),
    ],
  },
];

const snackTemplates = [
  {
    name: 'Fruit & Nuts',
    entries: [
      food('Apple', 120, 62, 0.3, 16.8, 0.2, 2.9),
      food('Almonds', 18, 105, 3.8, 3.8, 9.3, 2.1),
      food('Kefir', 180, 112, 5.8, 7.9, 5.8, 0),
    ],
  },
  {
    name: 'Protein Shake',
    entries: [
      food('Skim Milk', 220, 75, 7.5, 11, 0.4, 0),
      food('Whey Protein', 28, 110, 22.4, 2.8, 1.4, 0),
      food('Frozen Berries', 100, 48, 0.7, 12, 0.3, 4),
    ],
  },
  {
    name: 'Yogurt Snack',
    entries: [
      food('Greek Yogurt', 150, 99, 15, 6, 2.7, 0),
      food('Walnuts', 12, 78, 1.7, 1.6, 7.8, 0.8),
      food('Kiwi', 90, 55, 1, 13.2, 0.5, 2.7),
    ],
  },
];

const treatTemplates = [
  {
    name: 'Weekend Treat',
    entries: [
      food('San Sebastian Cheesecake', 85, 275, 5.3, 21, 18.5, 0.4),
      food('Americano', 250, 8, 0.4, 1, 0, 0),
    ],
  },
  {
    name: 'Dessert Night',
    entries: [
      food('Dark Chocolate', 28, 164, 2, 13, 11.2, 3.2),
      food('Protein Pudding', 150, 122, 16.5, 10, 2.5, 0.8),
    ],
  },
];

function food(name, portionGrams, calories, proteinG, carbsG, fatG, fiberG) {
  return { name, portionGrams, calories, proteinG, carbsG, fatG, fiberG };
}

function utcDate(dateLike) {
  return new Date(`${dateLike}T00:00:00.000Z`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function round(value) {
  return Number(value.toFixed(1));
}

function noise(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scaleEntry(entry, scale, dayKey, mealType, index) {
  return {
    id: `${dayKey}-${mealType}-${index}-${slug(entry.name)}`,
    name: entry.name,
    source: 'manual',
    portionGrams: round(entry.portionGrams * scale),
    calories: round(entry.calories * scale),
    proteinG: round(entry.proteinG * scale),
    carbsG: round(entry.carbsG * scale),
    fatG: round(entry.fatG * scale),
    fiberG: round(entry.fiberG * scale),
  };
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function cloneMeal(template, scale, dayKey, mealType) {
  return template.entries.map((entry, index) => scaleEntry(entry, scale, dayKey, mealType, index));
}

function sumEntries(entries) {
  return entries.reduce(
    (acc, entry) => {
      acc.calories += entry.calories;
      acc.proteinG += entry.proteinG;
      acc.carbsG += entry.carbsG;
      acc.fatG += entry.fatG;
      acc.fiberG += entry.fiberG || 0;
      return acc;
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function generateDailyMeals() {
  const totalDays = daysBetween(FIRST_LOG_DATE, LAST_LOG_DATE) + 1;
  const mealItems = [];
  const readModels = [];
  const dayTotals = [];

  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = addDays(FIRST_LOG_DATE, offset);
    const key = dateKey(date);
    const dow = date.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const isRecent = offset >= totalDays - 21;
    const isTrainingDay = [2, 4, 6].includes(dow);
    const isTreatDay = !isRecent && (offset % 31 === 9 || (isWeekend && offset % 44 === 12));
    const isLightDay = !isRecent && offset % 19 === 7;
    const breakfastTemplate = breakfastTemplates[offset % breakfastTemplates.length];
    const lunchTemplate = lunchTemplates[(offset + 1) % lunchTemplates.length];
    const dinnerTemplate = dinnerTemplates[(offset + 2) % dinnerTemplates.length];
    const snackTemplate = snackTemplates[(offset + 2) % snackTemplates.length];
    const breakfastScale = clamp(0.88 + noise(offset * 1.7) * 0.16, 0.78, 1.03);
    const lunchScale = clamp(0.9 + noise(offset * 2.1) * 0.18 + (isTrainingDay ? 0.04 : 0), 0.8, 1.08);
    const dinnerScale = clamp(0.92 + noise(offset * 2.6) * 0.2 + (isWeekend ? 0.04 : 0), 0.83, 1.1);
    const snackScale = clamp(0.84 + noise(offset * 3.2) * 0.18 + (isTrainingDay ? 0.06 : 0), 0.72, 1.04);

    const breakfastEntries = cloneMeal(breakfastTemplate, breakfastScale, key, 'breakfast');
    const lunchEntries = cloneMeal(lunchTemplate, lunchScale, key, 'lunch');
    const dinnerEntries = cloneMeal(dinnerTemplate, dinnerScale, key, 'dinner');
    const shouldAddSnack = isRecent || isTrainingDay || isWeekend || offset % 5 !== 0;
    const snackEntries = shouldAddSnack ? cloneMeal(snackTemplate, snackScale, key, 'snack') : [];
    const treatEntries = isTreatDay
      ? cloneMeal(treatTemplates[offset % treatTemplates.length], clamp(0.88 + noise(offset * 4.1) * 0.14, 0.82, 1.02), key, 'snack')
      : [];

    let finalSnackEntries = [...snackEntries, ...treatEntries];
    if (isLightDay && finalSnackEntries.length > 0) {
      finalSnackEntries = finalSnackEntries.slice(0, 1);
    }

    const slots = [
      { mealType: 'breakfast', entries: breakfastEntries },
      { mealType: 'lunch', entries: lunchEntries },
      { mealType: 'dinner', entries: dinnerEntries },
      ...(finalSnackEntries.length > 0 ? [{ mealType: 'snack', entries: finalSnackEntries }] : []),
    ];

    const totals = slots.reduce(
      (acc, slot) => {
        const slotTotals = sumEntries(slot.entries);
        acc.calories += slotTotals.calories;
        acc.proteinG += slotTotals.proteinG;
        acc.carbsG += slotTotals.carbsG;
        acc.fatG += slotTotals.fatG;
        acc.fiberG += slotTotals.fiberG;
        return acc;
      },
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    );

    dayTotals.push({
      date,
      key,
      calories: round(totals.calories),
      proteinG: round(totals.proteinG),
      carbsG: round(totals.carbsG),
      fatG: round(totals.fatG),
      fiberG: round(totals.fiberG),
    });

    for (const slot of slots) {
      const hour = slot.mealType === 'breakfast' ? '08' : slot.mealType === 'lunch' ? '13' : slot.mealType === 'dinner' ? '19' : '16';
      mealItems.push({
        userId: '',
        date,
        mealType: slot.mealType,
        entries: slot.entries,
        createdAt: new Date(`${key}T${hour}:00:00.000Z`),
        updatedAt: new Date(`${key}T${hour}:12:00.000Z`),
      });
      readModels.push({
        userId: '',
        date,
        mealType: slot.mealType,
        entries: slot.entries.map(({ id, ...entry }) => entry),
        loggedAt: new Date(`${key}T${hour}:13:00.000Z`),
      });
    }
  }

  return { mealItems, readModels, dayTotals };
}

function averageRecent(dayTotals, index, span) {
  const start = Math.max(0, index - span + 1);
  const slice = dayTotals.slice(start, index + 1);
  const total = slice.reduce((sum, day) => sum + day.calories, 0);
  return total / Math.max(slice.length, 1);
}

function generateMeasurements(dayTotals) {
  const measurements = [];
  const weeklyDates = [];
  for (let date = FIRST_LOG_DATE; date <= LAST_LOG_DATE; date = addDays(date, 7)) {
    weeklyDates.push(new Date(date));
  }

  const weightSeries = [];

  weeklyDates.forEach((date, index) => {
    const progress = index / Math.max(weeklyDates.length - 1, 1);
    const dayIndex = daysBetween(FIRST_LOG_DATE, date);
    const avgCalories = averageRecent(dayTotals, dayIndex, 7);
    const caloriesDeviation = (avgCalories - PLAN_TARGETS.dailyCalories) / 260;
    const taper = 1 - progress;

    const weight = round(
      PROFILE_BASE.initialWeightKg - 12.1 * progress + taper * 0.45 * Math.sin(index / 3.1) + caloriesDeviation * 0.3,
    );
    const bodyFat = round(36.5 - 9.6 * progress + taper * 0.42 * Math.sin(index / 4.3) + caloriesDeviation * 0.2);
    const waist = round(88 - 12.6 * progress + taper * 0.65 * Math.sin(index / 3.4) + caloriesDeviation * 0.4);
    const muscleMass = round(24.8 + 1.9 * progress + 0.12 * Math.sin(index / 5) - caloriesDeviation * 0.07);

    weightSeries.push(weight);

    measurements.push(metric(date, 'weight', weight, 'kg'));
    measurements.push(metric(date, 'bodyFat', bodyFat, '%'));
    measurements.push(metric(date, 'waist', waist, 'cm'));
    measurements.push(metric(date, 'muscleMass', muscleMass, 'kg'));

    if (index % 4 === 0 || index === weeklyDates.length - 1) {
      const neck = round(33.9 - 1.4 * progress + taper * 0.15 * Math.sin(index / 4.4));
      const hip = round(106.4 - 10.2 * progress + taper * 0.4 * Math.sin(index / 3.8));
      measurements.push(metric(date, 'neck', neck, 'cm'));
      measurements.push(metric(date, 'hip', hip, 'cm'));
    }
  });

  const latestWeight = weightSeries[weightSeries.length - 1];
  const latestWaist = measurements.filter((item) => item.metric === 'waist').at(-1).value;
  const latestHip = measurements.filter((item) => item.metric === 'hip').at(-1).value;
  const latestNeck = measurements.filter((item) => item.metric === 'neck').at(-1).value;

  return {
    measurements,
    currentWeightKg: latestWeight,
    // Current circumferences seeded onto the user profile — the plan-calculation
    // input and the fallback for regions with no measurement yet. Kept aligned
    // with the latest rows in `measurements`.
    circumferences: {
      neckCm: latestNeck,
      shoulderCm: 102,
      waistCm: latestWaist,
      hipCm: latestHip,
    },
  };
}

function metric(date, metricName, value, unit) {
  return {
    userId: '',
    metric: metricName,
    value,
    unit,
    date: new Date(`${dateKey(date)}T06:30:00.000Z`),
    source: 'manual',
    createdAt: new Date(`${dateKey(date)}T06:35:00.000Z`),
  };
}

async function seed() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const { mealItems, readModels, dayTotals } = generateDailyMeals();
  const { measurements, currentWeightKg, circumferences } = generateMeasurements(dayTotals);

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: DEMO_EMAIL }, { username: DEMO_USERNAME }],
    },
    select: { id: true },
  });

  const userId = existingUser?.id || undefined;

  if (userId) {
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { conversation: { userId } } }),
      prisma.conversation.deleteMany({ where: { userId } }),
      prisma.favoriteRecipe.deleteMany({ where: { userId } }),
      prisma.savedMeal.deleteMany({ where: { userId } }),
      prisma.subscription.deleteMany({ where: { userId } }),
      prisma.notificationPreference.deleteMany({ where: { userId } }),
      prisma.unitPreference.deleteMany({ where: { userId } }),
      prisma.bodyMeasurement.deleteMany({ where: { userId } }),
      prisma.mealLogReadModel.deleteMany({ where: { userId } }),
      prisma.mealItem.deleteMany({ where: { userId } }),
      prisma.foodEntry.deleteMany({ where: { userId } }),
      prisma.plan.deleteMany({ where: { userId } }),
      prisma.userProfile.deleteMany({ where: { userId } }),
      prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
  }

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: DEMO_EMAIL,
          passwordHash,
          name: DEMO_NAME,
          username: DEMO_USERNAME,
          bio: 'Female demo account seeded for analytics and end-to-end product walkthroughs.',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
          createdAt: utcDate('2025-08-20'),
        },
      })
    : await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          passwordHash,
          name: DEMO_NAME,
          username: DEMO_USERNAME,
          bio: 'Female demo account seeded for analytics and end-to-end product walkthroughs.',
          avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
          createdAt: utcDate('2025-08-20'),
        },
      });

  mealItems.forEach((item) => {
    item.userId = user.id;
  });
  readModels.forEach((item) => {
    item.userId = user.id;
  });
  measurements.forEach((item) => {
    item.userId = user.id;
  });

  await prisma.$transaction(async (tx) => {
    await tx.userProfile.create({
      data: {
        userId: user.id,
        weightKg: currentWeightKg,
        targetWeightKg: PROFILE_BASE.targetWeightKg,
        initialWeightKg: PROFILE_BASE.initialWeightKg,
        heightCm: PROFILE_BASE.heightCm,
        age: PROFILE_BASE.age,
        gender: PROFILE_BASE.gender,
        workoutsPerWeek: PROFILE_BASE.workoutsPerWeek,
        goal: PROFILE_BASE.goal,
        weeklyPaceKg: PROFILE_BASE.weeklyPaceKg,
        ...circumferences,
        createdAt: utcDate('2025-08-20'),
      },
    });

    await tx.plan.create({
      data: {
        userId: user.id,
        ...PLAN_TARGETS,
        createdAt: utcDate('2025-08-20'),
      },
    });

    await tx.unitPreference.create({
      data: {
        userId: user.id,
        weightUnit: 'kg',
        heightUnit: 'cm',
        energyUnit: 'kcal',
        waterUnit: 'ml',
      },
    });

    await tx.notificationPreference.create({
      data: {
        userId: user.id,
        masterEnabled: true,
        breakfastEnabled: true,
        breakfastTime: '08:15',
        lunchEnabled: true,
        lunchTime: '12:45',
        dinnerEnabled: true,
        dinnerTime: '19:15',
        waterReminders: true,
        streakSaver: true,
        weeklyReport: true,
      },
    });

    await tx.subscription.create({
      data: {
        userId: user.id,
        productId: 'premium_yearly',
        provider: 'appstore',
        status: 'active',
        expiresAt: new Date('2027-08-24T23:59:59.999Z'),
        createdAt: utcDate('2026-02-14'),
      },
    });

    await tx.favoriteRecipe.createMany({
      data: favoriteRecipes.map((item, index) => ({
        userId: user.id,
        title: item.title,
        emoji: item.emoji,
        imageUrl: null,
        kcal: item.kcal,
        prepTimeMinutes: item.prepTimeMinutes,
        createdAt: addDays(utcDate('2026-07-10'), index * 7),
      })),
    });

    await tx.savedMeal.createMany({
      data: savedMeals.map((item, index) => ({
        userId: user.id,
        title: item.title,
        emoji: item.emoji,
        imageUrl: null,
        kcal: item.kcal,
        proteinG: item.proteinG,
        createdAt: addDays(utcDate('2026-06-05'), index * 10),
      })),
    });

    await tx.mealItem.createMany({ data: mealItems });
    await tx.mealLogReadModel.createMany({ data: readModels });
    await tx.bodyMeasurement.createMany({ data: measurements });
  });

  const [todayMeals, yesterdayMeals] = await Promise.all([
    prisma.mealItem.count({
      where: {
        userId: user.id,
        date: TODAY,
      },
    }),
    prisma.mealItem.count({
      where: {
        userId: user.id,
        date: LAST_LOG_DATE,
      },
    }),
  ]);

  const summary = {
    email: DEMO_EMAIL,
    username: DEMO_USERNAME,
    password: DEMO_PASSWORD,
    gender: PROFILE_BASE.gender,
    userId: user.id,
    logsFrom: dateKey(FIRST_LOG_DATE),
    logsTo: dateKey(LAST_LOG_DATE),
    todayHasMeals: todayMeals > 0,
    todayMealCount: todayMeals,
    yesterdayMealCount: yesterdayMeals,
    mealItemCount: mealItems.length,
    readModelCount: readModels.length,
    measurementCount: measurements.length,
    currentWeightKg,
    planTargets: PLAN_TARGETS,
    generatedAt: TODAY.toISOString(),
  };

  console.log(JSON.stringify(summary, null, 2));
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
