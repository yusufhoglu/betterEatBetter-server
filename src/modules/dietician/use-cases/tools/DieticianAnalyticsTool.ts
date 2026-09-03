import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmToolDefinition } from '../../../../shared/llm/types';
import type { GetBodyStats } from '../../../body-analytics/use-cases/GetBodyStats';
import type { GetMealAverages } from '../../../body-analytics/use-cases/GetMealAverages';

import type { DieticianTool } from './DieticianTool';

const mealAverageRanges = ['week', 'month', 'threeMonths', 'sixMonths', 'year', 'allTime'] as const;
type MealAverageRange = (typeof mealAverageRanges)[number];

function isMealAverageRange(value: unknown): value is MealAverageRange {
  return typeof value === 'string' && (mealAverageRanges as readonly string[]).includes(value);
}

/**
 * Bridges to body-analytics's public use-cases only. `metric='bodyStats'`
 * returns current weight / body-fat / waist / BMI and their trends;
 * `metric='mealAverages'` returns average daily intake over the given range.
 */
export class DieticianAnalyticsTool implements DieticianTool {
  readonly definition: LlmToolDefinition = {
    name: 'get_analytics_summary',
    description:
      "Reads the user's body/nutrition analytics. metric='bodyStats' returns current weight, body fat, waist, BMI and 7-day trends. metric='mealAverages' returns average daily calories/protein/carbs/fiber over 'range' (default 'week').",
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['bodyStats', 'mealAverages'] },
        range: {
          type: 'string',
          enum: [...mealAverageRanges],
          description: "Only used with metric='mealAverages'; default 'week'.",
        },
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
    const metric = input.metric;

    if (metric === 'bodyStats') {
      return this.getBodyStats.execute(userId);
    }

    if (metric === 'mealAverages') {
      const range = isMealAverageRange(input.range) ? input.range : 'week';
      return this.getMealAverages.execute(userId, range);
    }

    throw new ValidationError(
      'INVALID_TOOL_INPUT',
      `get_analytics_summary received an unknown metric: "${String(metric)}"`,
    );
  }
}
