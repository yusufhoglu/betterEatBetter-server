import type { RecognitionSource } from './RecognitionSource';

export interface FoodItem {
  name: string;
  portionGrams: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export interface MacroSummary {
  totalCalories: number;
  totalProteinGrams: number;
  totalCarbsGrams: number;
  totalFatGrams: number;
}

/**
 * Common output entity produced by all four recognition flows.
 * `source` carries the originating flow so consumers can apply different
 * trust or display logic per source.
 * `needsUserAction` is set by ConfidencePolicy and indicates the result
 * should be reviewed before being logged.
 */
export interface FoodEntry {
  id: string;
  userId: string;
  source: RecognitionSource;
  /** 'processing' only applies to async photo flow; sync flows always resolve immediately */
  status: 'processing' | 'completed' | 'insufficient_data' | 'failed';
  items: FoodItem[];
  macros: MacroSummary;
  /** True when Python/LLM confidence is low and the user should confirm */
  needsUserAction: boolean;
  errorCode?: string;
  createdAt: Date;
}
