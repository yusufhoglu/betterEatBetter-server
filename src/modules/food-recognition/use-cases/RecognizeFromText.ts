import { ConfidencePolicy } from '../domain/policies/ConfidencePolicy';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { Locale } from '../../../shared/i18n/locale';
import type { TextEstimatorPort } from '../ports/TextEstimatorPort';
import type { FoodEntry } from '../domain/FoodEntry';

const logger = createModuleLogger('food-recognition');

export interface RecognizeFromTextInput {
  text: string;
  userId: string;
  /** Omitted for callers with no request-level locale (e.g. dietician tools) — the estimator then mirrors the input text's own language. */
  locale?: Locale;
}

export type RecognizeFromTextOutput = Omit<FoodEntry, 'id' | 'userId' | 'status' | 'errorCode' | 'createdAt'> & {
  source: 'text';
};

/**
 * Synchronous text recognition flow:
 * Sends free text to the LLM estimator and applies ConfidencePolicy.
 * No persistent storage — result returned directly.
 */
export class RecognizeFromText {
  constructor(private readonly estimator: TextEstimatorPort) {}

  async execute(input: RecognizeFromTextInput): Promise<RecognizeFromTextOutput> {
    const { text, locale } = input;

    const result = await this.estimator.estimate(text, locale);
    const needsUserAction = ConfidencePolicy.needsUserAction(result.status);

    if (needsUserAction) {
      logger.warn({ text: text.slice(0, 50) }, 'text recognition returned insufficient_data');
    }

    return {
      source: 'text',
      items: result.items,
      macros: result.macros,
      needsUserAction,
    };
  }
}
