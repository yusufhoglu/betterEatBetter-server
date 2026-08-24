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

export class TemplateInsightGenerator implements InsightGeneratorPort {
  generate(logs: MealLogReadModel[]): MealInsightCard[] {
    if (logs.length === 0) {
      return [{ title: 'No meal logs yet', body: 'Log a few meals to unlock nutrition insights.' }];
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

    return [
      {
        title: 'Latest day summary',
        body: `Your most recent logged day reached ${latestCalories} kcal.`,
      },
      {
        title: 'Protein consistency',
        body: `You logged at least 30g protein on ${proteinHeavyDays} distinct day(s) in this range.`,
      },
    ];
  }
}
