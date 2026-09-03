require('dotenv/config');

const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo.analytics@eatbetter.app';
const DEMO_PASSWORD = 'Demo123!';
const DEMO_NAME = 'Demo Analytics User';
const DEMO_USERNAME = 'demo_analytics_2026';
const TODAY = new Date('2026-08-25T00:00:00.000Z');
const LAST_LOG_DATE = new Date('2026-08-24T00:00:00.000Z');
const FIRST_LOG_DATE = new Date('2025-08-25T00:00:00.000Z');

const PLAN_TARGETS = {
  dailyCalories: 2350,
  proteinG: 185,
  carbsG: 240,
  fatG: 78,
};

const PROFILE_BASE = {
  initialWeightKg: 97.8,
  targetWeightKg: 82,
  heightCm: 182,
  age: 31,
  gender: 'male',
  workoutsPerWeek: 4,
  goal: 'lose',
  weeklyPaceKg: 0.25,
};

const favoriteRecipes = [
  { title: 'High Protein Menemen', emoji: '🍳', kcal: 410, prepTimeMinutes: 12 },
  { title: 'Chicken Rice Power Bowl', emoji: '🍚', kcal: 620, prepTimeMinutes: 20 },
  { title: 'Salmon Quinoa Plate', emoji: '🐟', kcal: 580, prepTimeMinutes: 25 },
  { title: 'Greek Yogurt Berry Bowl', emoji: '🥣', kcal: 360, prepTimeMinutes: 5 },
];

const savedMeals = [
  { title: 'Office Cut Lunch', emoji: '🥗', kcal: 540, proteinG: 46 },
  { title: 'Post Workout Shake', emoji: '💪', kcal: 310, proteinG: 34 },
  { title: 'Weekend Kebap Plate', emoji: '🍢', kcal: 760, proteinG: 52 },
];

const breakfastTemplates = [
  {
    name: 'Greek Yogurt Bowl',
    entries: [
      food('Greek Yogurt', 220, 146, 22, 8, 4, 0),
      food('Rolled Oats', 50, 194, 8, 33, 4, 5),
      food('Banana', 120, 107, 1, 27, 0, 3),
      food('Blueberries', 70, 40, 0.5, 10, 0.2, 2),
      food('Chia Seeds', 12, 58, 2, 5, 4, 5),
    ],
  },
  {
    name: 'Omelette Plate',
    entries: [
      food('Egg', 120, 172, 15, 1, 12, 0),
      food('Egg Whites', 120, 62, 13, 1, 0, 0),
      food('Whole Wheat Bread', 80, 198, 8, 35, 3, 6),
      food('Avocado', 70, 112, 1.4, 6, 10.4, 5),
      food('Tomato & Cucumber', 180, 34, 1.5, 7, 0.3, 2),
    ],
  },
  {
    name: 'Protein Overnight Oats',
    entries: [
      food('Rolled Oats', 65, 253, 11, 43, 4.5, 6),
      food('Skim Milk', 220, 75, 7.5, 11, 0.4, 0),
      food('Whey Protein', 30, 118, 24, 3, 1.5, 0),
      food('Strawberries', 100, 32, 0.7, 7.5, 0.3, 2),
      food('Peanut Butter', 18, 106, 4.5, 3.5, 9, 1),
    ],
  },
];

const lunchTemplates = [
  {
    name: 'Chicken Rice Bowl',
    entries: [
      food('Grilled Chicken Breast', 170, 281, 53, 0, 6, 0),
      food('Jasmine Rice', 210, 273, 5.4, 60, 0.6, 0.8),
      food('Roasted Vegetables', 180, 96, 3.6, 16, 3, 5),
      food('Olive Oil', 10, 90, 0, 0, 10, 0),
      food('Cacik', 120, 72, 4.2, 6, 3.2, 0),
    ],
  },
  {
    name: 'Turkey Wrap',
    entries: [
      food('Whole Wheat Tortilla', 80, 220, 7, 37, 5, 6),
      food('Turkey Breast', 160, 216, 44, 0, 4, 0),
      food('Hummus', 45, 118, 3.6, 10, 6.5, 3.8),
      food('Mixed Greens', 70, 14, 1, 2, 0.2, 1.3),
      food('Apple', 160, 83, 0.5, 22, 0.3, 4),
    ],
  },
  {
    name: 'Salmon Quinoa Salad',
    entries: [
      food('Salmon Fillet', 165, 338, 35, 0, 21, 0),
      food('Quinoa', 185, 222, 8, 39, 3.6, 5),
      food('Spinach Salad', 120, 38, 2.8, 5, 1.2, 2.4),
      food('Feta Cheese', 35, 93, 5, 1.4, 7.5, 0),
      food('Olive Oil', 8, 72, 0, 0, 8, 0),
    ],
  },
];

const dinnerTemplates = [
  {
    name: 'Beef Meatballs & Bulgur',
    entries: [
      food('Lean Beef Meatballs', 180, 342, 38, 8, 17, 0),
      food('Bulgur Pilaf', 220, 244, 7, 52, 2, 9),
      food('Shepherd Salad', 180, 64, 2, 10, 2.2, 3),
      food('Tzatziki', 80, 54, 3, 4, 2.5, 0),
    ],
  },
  {
    name: 'Chicken Pasta Night',
    entries: [
      food('Chicken Thigh', 170, 309, 34, 0, 18, 0),
      food('Whole Wheat Pasta', 210, 260, 11, 52, 2.1, 8),
      food('Tomato Sauce', 120, 58, 2, 11, 1.2, 2.5),
      food('Parmesan', 18, 78, 7, 0.6, 5.2, 0),
      food('Broccoli', 140, 48, 4, 9, 0.6, 4),
    ],
  },
  {
    name: 'Sea Bass Plate',
    entries: [
      food('Sea Bass', 190, 286, 41, 0, 13, 0),
      food('Sweet Potato', 240, 206, 4, 48, 0.3, 7),
      food('Green Beans', 160, 56, 3, 12, 0.4, 5),
      food('Olive Oil', 8, 72, 0, 0, 8, 0),
    ],
  },
];

const snackTemplates = [
  {
    name: 'Protein Snack',
    entries: [
      food('Whey Protein', 30, 118, 24, 3, 1.5, 0),
      food('Apple', 150, 78, 0.5, 21, 0.3, 4),
      food('Almonds', 22, 128, 4.5, 4.5, 11, 2.5),
    ],
  },
  {
    name: 'Kefir & Fruit',
    entries: [
      food('Kefir', 250, 155, 8, 11, 8, 0),
      food('Banana', 110, 98, 1.1, 25, 0.3, 2.8),
      food('Walnuts', 15, 98, 2.2, 2, 9.8, 1),
    ],
  },
  {
    name: 'Recovery Shake',
    entries: [
      food('Skim Milk', 250, 85, 8.5, 12, 0.5, 0),
      food('Whey Protein', 35, 138, 28, 3.5, 1.8, 0),
      food('Frozen Berries', 120, 58, 0.8, 14, 0.4, 4.8),
      food('Peanut Butter', 16, 94, 4, 3, 8, 1),
    ],
  },
];

const treatTemplates = [
  {
    name: 'Weekend Treat',
    entries: [
      food('Baklava', 110, 478, 7, 53, 27, 2),
      food('Turkish Coffee', 60, 22, 0.4, 4, 0.2, 0),
    ],
  },
  {
    name: 'Dessert Night',
    entries: [
      food('Dark Chocolate', 35, 205, 2.5, 16, 14, 4),
      food('Protein Pudding', 180, 146, 20, 12, 3, 1),
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

function gaussianBump(index, center, width, amplitude) {
  const distance = index - center;
  return amplitude * Math.exp(-(distance * distance) / (2 * width * width));
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
    const progress = offset / Math.max(totalDays - 1, 1);
    const isWeekend = dow === 0 || dow === 6;
    const isRecent = offset >= totalDays - 21;
    const isTrainingDay = [1, 3, 5].includes(dow);
    const isTreatDay = !isRecent && (offset % 29 === 8 || (isWeekend && offset % 41 === 10));
    const isLightDay = !isRecent && offset % 23 === 5;
    const breakfastTemplate = breakfastTemplates[offset % breakfastTemplates.length];
    const lunchTemplate = lunchTemplates[(offset + 1) % lunchTemplates.length];
    const dinnerTemplate = dinnerTemplates[(offset + 2) % dinnerTemplates.length];
    const snackTemplate = snackTemplates[(offset + 1) % snackTemplates.length];
    const breakfastScale = clamp(0.94 + noise(offset * 1.7) * 0.18, 0.85, 1.16);
    const lunchScale = clamp(0.95 + noise(offset * 2.1) * 0.2 + (isTrainingDay ? 0.05 : 0), 0.86, 1.18);
    const dinnerScale = clamp(0.97 + noise(offset * 2.6) * 0.22 + (isWeekend ? 0.03 : 0), 0.88, 1.22);
    const snackScale = clamp(0.9 + noise(offset * 3.2) * 0.24 + (isTrainingDay ? 0.08 : 0), 0.82, 1.18);

    const breakfastEntries = cloneMeal(breakfastTemplate, breakfastScale, key, 'breakfast');
    const lunchEntries = cloneMeal(lunchTemplate, lunchScale, key, 'lunch');
    const dinnerEntries = cloneMeal(dinnerTemplate, dinnerScale, key, 'dinner');
    const shouldAddSnack = isRecent || isTrainingDay || isWeekend || offset % 4 !== 0;
    const snackEntries = shouldAddSnack ? cloneMeal(snackTemplate, snackScale, key, 'snack') : [];
    const treatEntries = isTreatDay
      ? cloneMeal(treatTemplates[offset % treatTemplates.length], clamp(0.95 + noise(offset * 4.1) * 0.18, 0.9, 1.15), key, 'snack')
      : [];

    let finalSnackEntries = [...snackEntries, ...treatEntries];
    if (isLightDay && finalSnackEntries.length > 0) {
      finalSnackEntries = finalSnackEntries.slice(0, Math.max(finalSnackEntries.length - 1, 1));
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
      mealItems.push({
        userId: '',
        date,
        mealType: slot.mealType,
        entries: slot.entries,
        createdAt: new Date(`${key}T${slot.mealType === 'breakfast' ? '07' : slot.mealType === 'lunch' ? '12' : slot.mealType === 'dinner' ? '18' : '15'}:00:00.000Z`),
        updatedAt: new Date(`${key}T${slot.mealType === 'breakfast' ? '07' : slot.mealType === 'lunch' ? '12' : slot.mealType === 'dinner' ? '18' : '15'}:15:00.000Z`),
      });
      readModels.push({
        userId: '',
        date,
        mealType: slot.mealType,
        entries: slot.entries.map(({ id, ...entry }) => entry),
        loggedAt: new Date(`${key}T${slot.mealType === 'breakfast' ? '07' : slot.mealType === 'lunch' ? '12' : slot.mealType === 'dinner' ? '18' : '15'}:16:00.000Z`),
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
    const caloriesDeviation = (avgCalories - PLAN_TARGETS.dailyCalories) / 300;
    const taper = 1 - progress;
    const rebound =
      gaussianBump(index, 10, 2.2, 1.1) +
      gaussianBump(index, 22, 2.8, 0.8) +
      gaussianBump(index, 38, 2.5, 0.6);
    const momentumDip =
      gaussianBump(index, 16, 2.1, 0.5) +
      gaussianBump(index, 30, 2.3, 0.4);
    const weight = round(
      PROFILE_BASE.initialWeightKg -
        13.2 * progress +
        taper * 0.65 * Math.sin(index / 2.9) +
        0.28 * Math.sin(index / 1.35) +
        rebound -
        momentumDip +
        caloriesDeviation * 0.42,
    );
    const bodyFat = round(
      31.2 -
        8.9 * progress +
        taper * 0.42 * Math.sin(index / 4.1) +
        0.18 * Math.sin(index / 1.8) +
        rebound * 0.45 -
        momentumDip * 0.2 +
        caloriesDeviation * 0.22,
    );
    const waist = round(
      108 -
        15.8 * progress +
        taper * 0.9 * Math.sin(index / 3.6) +
        0.35 * Math.sin(index / 1.7) +
        rebound * 0.7 -
        momentumDip * 0.3 +
        caloriesDeviation * 0.5,
    );
    const muscleMass = round(
      35.6 +
        2.6 * progress +
        0.2 * Math.sin(index / 5.2) -
        rebound * 0.08 +
        momentumDip * 0.12 -
        caloriesDeviation * 0.08,
    );

    weightSeries.push(weight);

    measurements.push(metric(date, 'weight', weight, 'kg'));
    measurements.push(metric(date, 'bodyFat', bodyFat, '%'));
    measurements.push(metric(date, 'waist', waist, 'cm'));
    measurements.push(metric(date, 'muscleMass', muscleMass, 'kg'));

    if (index % 4 === 0 || index === weeklyDates.length - 1) {
      const neck = round(41.5 - 2.2 * progress + taper * 0.18 * Math.sin(index / 4.7));
      const hip = round(108.5 - 8.3 * progress + taper * 0.45 * Math.sin(index / 3.9));
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
      shoulderCm: 123,
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
    date: new Date(`${dateKey(date)}T06:00:00.000Z`),
    source: 'manual',
    createdAt: new Date(`${dateKey(date)}T06:05:00.000Z`),
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
          bio: 'Demo account seeded for analytics and end-to-end product walkthroughs.',
          avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
          createdAt: utcDate('2025-08-20'),
        },
      })
    : await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
          passwordHash,
          name: DEMO_NAME,
          username: DEMO_USERNAME,
          bio: 'Demo account seeded for analytics and end-to-end product walkthroughs.',
          avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
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
        breakfastTime: '08:00',
        lunchEnabled: true,
        lunchTime: '12:30',
        dinnerEnabled: true,
        dinnerTime: '19:00',
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
        createdAt: utcDate('2026-01-10'),
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
        createdAt: addDays(utcDate('2026-07-15'), index * 8),
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
        createdAt: addDays(utcDate('2026-06-01'), index * 11),
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
    password: DEMO_PASSWORD,
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
