import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmToolDefinition } from '../../../../shared/llm/types';
import type { GetBodyStats } from '../../../body-analytics/use-cases/GetBodyStats';
import type { GetMealAverages } from '../../../body-analytics/use-cases/GetMealAverages';

const mealAverageRanges = ['week', 'month', 'threeMonths', 'sixMonths', 'year', 'allTime'] as const;
type MealAverageRange = (typeof mealAverageRanges)[number];

export interface AnalyticsSummaryToolInput {
  metric: 'bodyStats' | 'mealAverages';
  range?: MealAverageRange;
}

function isMealAverageRange(value: unknown): value is MealAverageRange {
  return typeof value === 'string' && (mealAverageRanges as readonly string[]).includes(value);
}

/**
 * Bridges to body-analytics's public use-cases — never reaches into its
 * domain/ or adapters/ folders directly.
 */
export class AnalyticsSummaryTool {
  readonly definition: LlmToolDefinition = {
    name: 'get_analytics_summary',
    description:
      "Kullanıcının vücut/beslenme analitiklerini getirir. metric='bodyStats' ile güncel kilo/vücut yağı/bel çevresi/BMI ve trendleri, metric='mealAverages' ile belirtilen aralıktaki (varsayılan 'week') ortalama günlük kalori/protein/karbonhidrat tüketimi döner.",
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['bodyStats', 'mealAverages'] },
        range: { type: 'string', enum: [...mealAverageRanges], description: "Sadece metric='mealAverages' iken kullanılır, varsayılan 'week'." },
      },
      required: ['metric'],
      additionalProperties: false,
    },
  };

  constructor(
    private readonly getBodyStats: GetBodyStats,
    private readonly getMealAverages: GetMealAverages,
  ) {}

  async execute(userId: string, input: Record<string, unknown>): Promise<unknown> {
    // input is LLM/JSON-controlled — never trust AnalyticsSummaryToolInput's shape without a runtime check.
    const metric = input.metric;

    if (metric === 'bodyStats') {
      return this.getBodyStats.execute(userId);
    }

    if (metric === 'mealAverages') {
      const range = isMealAverageRange(input.range) ? input.range : 'week';
      return this.getMealAverages.execute(userId, range);
    }

    throw new ValidationError('INVALID_TOOL_INPUT', `get_analytics_summary received an unknown metric: "${String(metric)}"`);
  }
}
