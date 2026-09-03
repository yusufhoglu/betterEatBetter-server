import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmToolDefinition } from '../../../../shared/llm/types';
import type { FoodEntry } from '../../../food-recognition/domain/FoodEntry';
import type { RecognizeFromText } from '../../../food-recognition/use-cases/RecognizeFromText';
import type { MealLogProposal } from '../../domain/MealLogProposal';
import type { DieticianTool } from './DieticianTool';

/**
 * Bridges to food-recognition's public RecognizeFromText. Produces a logging
 * SUGGESTION only — the dietician never writes a meal (dietician-rule.md).
 * Draft revision lives in the chatbot flow; the dietician only creates fresh
 * drafts from a description.
 */
export class ProposeMealLogTool implements DieticianTool {
  readonly definition: LlmToolDefinition = {
    name: 'propose_meal_log',
    description:
      'Use when the user describes a meal they ate or want to log and asks for help logging it. Produces a draft estimate; it never saves. Not for hypothetical "what should I eat" questions.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: "The user's meal description, e.g. '2 eggs, toast and a banana'",
        },
      },
      required: ['description'],
      additionalProperties: false,
    },
  };

  readonly yieldsProposal = true;

  constructor(private readonly recognizeFromText: RecognizeFromText) {}

  async execute(userId: string, input: Record<string, unknown>): Promise<MealLogProposal> {
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (!description) {
      throw new ValidationError('INVALID_TOOL_INPUT', "propose_meal_log requires a non-empty 'description'");
    }

    const result = await this.recognizeFromText.execute({ text: description, userId });

    const entry: FoodEntry = {
      id: randomUUID(),
      userId,
      source: result.source,
      status: result.needsUserAction ? 'insufficient_data' : 'completed',
      items: result.items,
      macros: result.macros,
      needsUserAction: result.needsUserAction,
      createdAt: new Date(),
    };

    return { entries: [entry], rawDescription: description };
  }
}
