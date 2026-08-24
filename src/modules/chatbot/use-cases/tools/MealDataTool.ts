import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmToolDefinition } from '../../../../shared/llm/types';
import type { GetDaySummary } from '../../../nutrition-logging/use-cases/GetDaySummary';
import type { GetLoggedMealTypesForDateRange } from '../../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';

export interface MealDataToolInput {
  date?: string;
  startDate?: string;
  endDate?: string;
}

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('INVALID_TOOL_INPUT', `Invalid date: "${value}"`);
  }
  return date;
}

/**
 * Bridges to nutrition-logging's public use-cases — never reaches into its
 * domain/ or adapters/ folders directly.
 */
export class MealDataTool {
  readonly definition: LlmToolDefinition = {
    name: 'get_meal_data',
    description:
      "Kullanıcının loglanmış öğün verilerini getirir. 'date' verilirse o günün besin özeti (tüketim, hedefler, kalan kalori) döner; 'startDate' ve 'endDate' verilirse o aralıkta hangi öğün tiplerinin (kahvaltı/öğle/akşam/atıştırmalık) loglandığı döner.",
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD formatında tek bir gün' },
        startDate: { type: 'string', description: 'YYYY-MM-DD formatında aralık başlangıcı' },
        endDate: { type: 'string', description: 'YYYY-MM-DD formatında aralık bitişi' },
      },
      additionalProperties: false,
    },
  };

  constructor(
    private readonly getDaySummary: GetDaySummary,
    private readonly getLoggedMealTypesForDateRange: GetLoggedMealTypesForDateRange,
  ) {}

  async execute(userId: string, input: Record<string, unknown>): Promise<unknown> {
    // input is LLM/JSON-controlled — never trust MealDataToolInput's shape without a runtime check.
    const date = typeof input.date === 'string' ? input.date : undefined;
    const startDate = typeof input.startDate === 'string' ? input.startDate : undefined;
    const endDate = typeof input.endDate === 'string' ? input.endDate : undefined;

    if (date) {
      return this.getDaySummary.execute({ userId, date: parseDate(date) });
    }

    if (startDate && endDate) {
      return this.getLoggedMealTypesForDateRange.execute(userId, parseDate(startDate), parseDate(endDate));
    }

    throw new ValidationError('INVALID_TOOL_INPUT', "get_meal_data requires either 'date' or both 'startDate' and 'endDate'");
  }
}
