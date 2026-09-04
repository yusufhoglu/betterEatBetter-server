import { z } from 'zod';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmClient } from '../../../../shared/llm/LlmClient';
import { requestStructuredOutput } from '../../../../shared/llm/structuredOutput';
import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';
import type { RecognizeFromText } from '../../../food-recognition/use-cases/RecognizeFromText';
import type { MealRating } from '../../domain/MealRating';
import type { DieticianTool } from './DieticianTool';

const RATE_MEAL_SYSTEM_PROMPT = [
  "Score the described meal 0-10 against the user's plan and today's intake (given as context) —",
  'higher means a better fit for their goal and remaining budget. Flag at most one macro as "high"',
  '(protein/carbs/fat) only if one is clearly disproportionate, else null.',
  'goodNote: one sentence on what is working. fixNote: one sentence with the single most useful change.',
  'Return exactly one structured result.',
].join(' ');

const rateMealResultSchema = z.object({
  score: z.number().min(0).max(10),
  flaggedMacro: z.enum(['protein', 'carbs', 'fat']).nullable(),
  goodNote: z.string(),
  fixNote: z.string(),
});

/**
 * Bridges to food-recognition's `RecognizeFromText` for the macros (same as
 * `ProposeMealLogTool`), then a small cheap structured call scores it against
 * the plan context already present in `context.messages`. Never writes anything.
 */
export class RateMealTool implements DieticianTool {
  readonly definition: LlmToolDefinition = {
    name: 'rate_meal',
    description:
      'Use when the user asks how good / how healthy a meal is, or to rate a meal they ate or are considering. ' +
      "Produces a 0-10 score with one concrete fix. Not for logging (use propose_meal_log) and not for 'what should I eat'.",
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: "The meal to rate, e.g. '2 eggs, toast and a banana'",
        },
      },
      required: ['description'],
      additionalProperties: false,
    },
  };

  readonly yieldsCard = 'rating' as const;

  constructor(
    private readonly recognizeFromText: RecognizeFromText,
    private readonly llmClient: LlmClient,
    private readonly cheapModel: string,
  ) {}

  async execute(
    userId: string,
    input: Record<string, unknown>,
    context: { conversationId: string; messages: LlmMessage[] },
  ): Promise<MealRating> {
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (!description) {
      throw new ValidationError('INVALID_TOOL_INPUT', "rate_meal requires a non-empty 'description'");
    }

    const recognized = await this.recognizeFromText.execute({ text: description, userId });

    const scored = await requestStructuredOutput({
      client: this.llmClient,
      request: {
        system: RATE_MEAL_SYSTEM_PROMPT,
        messages: [
          ...context.messages.filter((message) => message.role === 'system'),
          {
            role: 'user',
            content:
              `Meal: ${description}\n` +
              `Calories=${recognized.macros.totalCalories}, Protein=${recognized.macros.totalProteinGrams}g, ` +
              `Carbs=${recognized.macros.totalCarbsGrams}g, Fat=${recognized.macros.totalFatGrams}g`,
          },
        ],
        model: this.cheapModel,
        feature: 'dietician:rate_meal',
      },
      resultSchema: rateMealResultSchema,
    });

    return {
      mealName: description,
      score: scored.score,
      macros: recognized.macros,
      flaggedMacro: scored.flaggedMacro,
      goodNote: scored.goodNote,
      fixNote: scored.fixNote,
    };
  }
}
