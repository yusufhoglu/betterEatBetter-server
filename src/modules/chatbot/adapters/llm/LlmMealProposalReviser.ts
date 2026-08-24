import type { IPolicy } from 'cockatiel';
import { z } from 'zod';
import { env } from '../../../../shared/config/env';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import type { LlmClient } from '../../../../shared/llm/LlmClient';
import { createLlmClient } from '../../../../shared/llm/llmClientFactory';
import { requestStructuredOutput } from '../../../../shared/llm/structuredOutput';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import type { FoodEntry } from '../../../food-recognition/domain/FoodEntry';
import type { MealLogProposal } from '../../domain/MealLogProposal';

const logger = createModuleLogger('chatbot');
const FEATURE = 'chatbot-meal-proposal';

const revisedProposalSchema = z.object({
  rawDescription: z.string().min(1),
  status: z.enum(['sufficient', 'insufficient_data']),
  items: z.array(
    z.object({
      name: z.string(),
      portionGrams: z.number(),
      calories: z.number(),
      proteinGrams: z.number(),
      carbsGrams: z.number(),
      fatGrams: z.number(),
    }),
  ),
  macros: z.object({
    totalCalories: z.number(),
    totalProteinGrams: z.number(),
    totalCarbsGrams: z.number(),
    totalFatGrams: z.number(),
  }),
});

const REVISER_SYSTEM_PROMPT =
  'You revise an existing meal draft using the user clarification. ' +
  'Return exactly one structured result. ' +
  'If the draft is still too ambiguous after the clarification, set status="insufficient_data". ' +
  'Otherwise produce the revised item list and macro totals. Do not return prose.';

export class LlmMealProposalReviser {
  private readonly policy: IPolicy;

  constructor(
    private readonly llmClient: LlmClient = createLlmClient(),
    policy?: IPolicy,
  ) {
    this.policy = policy ?? buildResiliencePolicy({
      timeoutMs: 60_000,
      circuitBreakerThreshold: 5,
      circuitBreakerHalfOpenAfterMs: 30_000,
      retryAttempts: 2,
    });
  }

  async revise(baseProposal: MealLogProposal, instruction: string): Promise<MealLogProposal> {
    try {
      const result = await this.policy.execute(() =>
        requestStructuredOutput({
          client: this.llmClient,
          request: {
            system: REVISER_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  'Existing meal draft JSON:',
                  JSON.stringify(baseProposal),
                  '',
                  'User clarification:',
                  instruction,
                ].join('\n'),
              },
            ],
            feature: FEATURE,
            model: env.FOOD_TEXT_MODEL,
          },
          resultSchema: revisedProposalSchema,
          toolDescription: 'Report the revised meal draft as structured meal data.',
        }),
      );

      const preservedSource: FoodEntry['source'] = baseProposal.entries[0]?.source ?? 'text';

      return {
        rawDescription: result.rawDescription,
        entries: [
          {
            id: baseProposal.entries[0]?.id ?? 'revised-meal-entry',
            userId: baseProposal.entries[0]?.userId ?? 'unknown-user',
            source: preservedSource,
            status: result.status === 'insufficient_data' ? 'insufficient_data' : 'completed',
            items: result.items,
            macros: result.macros,
            needsUserAction: result.status === 'insufficient_data',
            createdAt: baseProposal.entries[0]?.createdAt ?? new Date(),
          },
        ],
      };
    } catch (err) {
      if (err instanceof IntegrationError) {
        throw err;
      }

      logger.warn({ err }, 'meal proposal reviser circuit is open or timed out');
      throw new IntegrationError('LLM_CIRCUIT_OPEN', 'Meal proposal reviser is unavailable', false);
    }
  }
}
