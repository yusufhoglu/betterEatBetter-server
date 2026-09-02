import type { Locale } from '../../../../shared/i18n/locale';
import type { InsightGeneratorPort } from '../../ports/InsightGeneratorPort';
import type { MealInsightCard, MealLogReadModel } from '../../domain/bodyAnalyticsTypes';

function dayCalories(logs: MealLogReadModel[]): number {
  return logs.reduce((total, log) => {
    return (
      total +
      log.entries.reduce((entryTotal, entry) => entryTotal + entry.calories, 0)
    );
  }, 0);
}

interface InsightCopy {
  emptyState: MealInsightCard;
  latestDaySummary: (calories: number) => MealInsightCard;
  proteinConsistency: (days: number) => MealInsightCard;
}

const COPY: Record<Locale, InsightCopy> = {
  en: {
    emptyState: { title: 'No meal logs yet', body: 'Log a few meals to unlock nutrition insights.' },
    latestDaySummary: (calories) => ({
      title: 'Latest day summary',
      body: `Your most recent logged day reached ${calories} kcal.`,
    }),
    proteinConsistency: (days) => ({
      title: 'Protein consistency',
      body: `You logged at least 30g protein on ${days} distinct day(s) in this range.`,
    }),
  },
  tr: {
    emptyState: {
      title: 'Henüz öğün kaydı yok',
      body: 'Beslenme içgörülerini açmak için birkaç öğün kaydet.',
    },
    latestDaySummary: (calories) => ({
      title: 'Son gün özeti',
      body: `En son kaydettiğin gün ${calories} kcal'ye ulaştı.`,
    }),
    proteinConsistency: (days) => ({
      title: 'Protein tutarlılığı',
      body: `Bu aralıkta ${days} ayrı günde en az 30g protein kaydettin.`,
    }),
  },
};

export class TemplateInsightGenerator implements InsightGeneratorPort {
  generate(logs: MealLogReadModel[], locale: Locale): MealInsightCard[] {
    const copy = COPY[locale];

    if (logs.length === 0) {
      return [copy.emptyState];
    }

    const sorted = [...logs].sort((left, right) => right.date.getTime() - left.date.getTime());
    const latestDate = sorted[0]!.date.toISOString().slice(0, 10);
    const latestDayLogs = sorted.filter((log) => log.date.toISOString().slice(0, 10) === latestDate);
    const latestCalories = Math.round(dayCalories(latestDayLogs));
    const proteinHeavyDays = new Set(
      logs
        .filter((log) => log.entries.reduce((sum, entry) => sum + entry.proteinG, 0) >= 30)
        .map((log) => log.date.toISOString().slice(0, 10)),
    ).size;

    return [copy.latestDaySummary(latestCalories), copy.proteinConsistency(proteinHeavyDays)];
  }
}
