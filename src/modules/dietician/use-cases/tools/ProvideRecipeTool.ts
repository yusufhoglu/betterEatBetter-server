import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmClient } from '../../../../shared/llm/LlmClient';
import { requestStructuredOutput } from '../../../../shared/llm/structuredOutput';
import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';
import { recipeSchema, type Recipe } from '../../domain/Recipe';
import type { DieticianTool } from './DieticianTool';

const PROVIDE_RECIPE_SYSTEM_PROMPT = [
  "Write one recipe that fits the request, sized to the calories the user has left today (given as context, if any).",
  'Keep it realistic and concrete: real ingredient amounts, ordered steps. `why` is one line tying it to their plan.',
  'Return exactly one structured result.',
].join(' ');

/**
 * One cheap structured-output call produces the full recipe — never a prime
 * completion (dietician-backend-changes.md Change 2b). Never writes anything;
 * "log this meal" from the mobile recipe view is a normal chat message that
 * hits the existing `log_help` -> `propose_meal_log` path.
 */
export class ProvideRecipeTool implements DieticianTool {
  readonly definition: LlmToolDefinition = {
    name: 'provide_recipe',
    description:
      "Use when the user explicitly asks for a recipe, or asks for a 'lighter version' / variant of a meal just " +
      'discussed. Returns a full recipe sized to the calories the user has left. Never for a plain meal suggestion ' +
      '(answer those in prose).',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: "What the user asked for, e.g. 'high-protein dinner'" },
        targetCalories: { type: 'number', description: 'Calories to size the recipe to, if known' },
      },
      required: ['request'],
      additionalProperties: false,
    },
  };

  readonly yieldsCard = 'recipe' as const;

  constructor(
    private readonly llmClient: LlmClient,
    private readonly cheapModel: string,
  ) {}

  async execute(
    _userId: string,
    input: Record<string, unknown>,
    context: { conversationId: string; messages: LlmMessage[] },
  ): Promise<Recipe> {
    const request = typeof input.request === 'string' ? input.request.trim() : '';
    if (!request) {
      throw new ValidationError('INVALID_TOOL_INPUT', "provide_recipe requires a non-empty 'request'");
    }
    const targetCalories = typeof input.targetCalories === 'number' ? input.targetCalories : undefined;

    return requestStructuredOutput({
      client: this.llmClient,
      request: {
        system: PROVIDE_RECIPE_SYSTEM_PROMPT,
        messages: [
          ...context.messages.filter((message) => message.role === 'system'),
          {
            role: 'user',
            content:
              targetCalories !== undefined
                ? `Recipe request: ${request}\nTarget calories: ${Math.round(targetCalories)}`
                : `Recipe request: ${request}`,
          },
        ],
        model: this.cheapModel,
        feature: 'dietician:provide_recipe',
      },
      resultSchema: recipeSchema,
    });
  }
}
