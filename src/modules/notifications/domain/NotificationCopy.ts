import type { Locale } from '../../../shared/i18n/locale';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface NotificationContent {
  title: string;
  body: string;
}

export interface WeeklyReportFacts {
  daysCompleted: number;
  currentStreak: number;
  avgCalories: number;
}

interface CopyTable {
  mealReminder: Record<MealSlot, NotificationContent>;
  streakSaver: (currentStreak: number) => NotificationContent;
  weeklyReport: (facts: WeeklyReportFacts) => NotificationContent;
}

const COPY: Record<Locale, CopyTable> = {
  en: {
    mealReminder: {
      breakfast: { title: 'Breakfast time', body: 'Log your breakfast to keep your day on track.' },
      lunch: { title: 'Lunch time', body: 'Take a moment to log your lunch.' },
      dinner: { title: 'Dinner time', body: 'Log your dinner before you wind down.' },
    },
    streakSaver: (currentStreak) => ({
      title: 'Don’t break your streak',
      body:
        currentStreak > 0
          ? `Your ${currentStreak}-day streak ends tonight unless you finish logging today.`
          : 'Finish logging today to start a new streak.',
    }),
    weeklyReport: ({ daysCompleted, currentStreak, avgCalories }) => ({
      title: 'Your week in review',
      body: `${daysCompleted}/7 days fully logged, ${currentStreak}-day streak, ${avgCalories} kcal/day on average.`,
    }),
  },
  tr: {
    mealReminder: {
      breakfast: { title: 'Kahvaltı vakti', body: 'Gününe iyi başlamak için kahvaltını kaydet.' },
      lunch: { title: 'Öğle yemeği vakti', body: 'Öğle yemeğini kaydetmek için bir dakika ayır.' },
      dinner: { title: 'Akşam yemeği vakti', body: 'Günü kapatmadan akşam yemeğini kaydet.' },
    },
    streakSaver: (currentStreak) => ({
      title: 'Serini bozma',
      body:
        currentStreak > 0
          ? `Bugünü tamamlamazsan ${currentStreak} günlük serin bu gece sona eriyor.`
          : 'Yeni bir seri başlatmak için bugünü tamamla.',
    }),
    weeklyReport: ({ daysCompleted, currentStreak, avgCalories }) => ({
      title: 'Haftalık özetin',
      body: `7 günün ${daysCompleted}’i tam kayıtlı, ${currentStreak} günlük seri, günde ortalama ${avgCalories} kcal.`,
    }),
  },
};

export function mealReminderContent(meal: MealSlot, locale: Locale): NotificationContent {
  return COPY[locale].mealReminder[meal];
}

export function streakSaverContent(currentStreak: number, locale: Locale): NotificationContent {
  return COPY[locale].streakSaver(currentStreak);
}

export function weeklyReportContent(facts: WeeklyReportFacts, locale: Locale): NotificationContent {
  return COPY[locale].weeklyReport(facts);
}
