import { ConfidencePolicy } from '../domain/policies/ConfidencePolicy';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { TextEstimatorPort } from '../ports/TextEstimatorPort';
import type { FoodEntry } from '../domain/FoodEntry';

const logger = createModuleLogger('food-recognition');

export interface RecognizeFromTextInput {
  text: string;
  userId: string;
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
    const { text } = input;

    const result = await this.estimator.estimate(text);
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
