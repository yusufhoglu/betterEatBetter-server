import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmToolDefinition } from '../../../../shared/llm/types';
import type { GetDayNutrientTotals } from '../../../nutrition-logging/use-cases/GetDayNutrientTotals';
import type { GetLoggedMealTypesForDateRange } from '../../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import type { DieticianTool } from './DieticianTool';

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('INVALID_TOOL_INPUT', `Invalid date: "${value}"`);
  }
  return date;
}

/**
 * Bridges to nutrition-logging's public use-cases only — never its domain/ or
 * adapters/ (dietician-rule.md).
 */
export class DieticianMealDataTool implements DieticianTool {
  readonly definition: LlmToolDefinition = {
    name: 'get_meal_data',
    description:
      "Reads the user's logged meal data. With 'date' (YYYY-MM-DD) it returns that day's consumed calories/macros, targets and remaining calories. With 'startDate' and 'endDate' it returns which meal types were logged per day in that range.",
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'A single day, YYYY-MM-DD' },
        startDate: { type: 'string', description: 'Range start, YYYY-MM-DD' },
        endDate: { type: 'string', description: 'Range end, YYYY-MM-DD' },
      },
      additionalProperties: false,
    },
  };

  constructor(
    private readonly getDayNutrientTotals: GetDayNutrientTotals,
    private readonly getLoggedMealTypesForDateRange: GetLoggedMealTypesForDateRange,
  ) {}

  async execute(userId: string, input: Record<string, unknown>): Promise<unknown> {
    const date = typeof input.date === 'string' ? input.date : undefined;
    const startDate = typeof input.startDate === 'string' ? input.startDate : undefined;
    const endDate = typeof input.endDate === 'string' ? input.endDate : undefined;

    if (date) {
      return this.getDayNutrientTotals.execute({ userId, date: parseDate(date) });
    }

    if (startDate && endDate) {
      return this.getLoggedMealTypesForDateRange.execute(userId, parseDate(startDate), parseDate(endDate));
    }

    throw new ValidationError('INVALID_TOOL_INPUT', "get_meal_data requires either 'date' or both 'startDate' and 'endDate'");
  }
}
