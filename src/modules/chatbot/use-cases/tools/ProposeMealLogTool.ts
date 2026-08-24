import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';
import type { FoodEntry } from '../../../food-recognition/domain/FoodEntry';
import type { RecognizeFromText } from '../../../food-recognition/use-cases/RecognizeFromText';
import { LlmMealProposalReviser } from '../../adapters/llm/LlmMealProposalReviser';
import { findLatestProposal } from '../../domain/mealProposalUtils';
import type { MealLogProposal } from '../../domain/MealLogProposal';
import type { ConversationRepositoryPort } from '../../ports/ConversationRepositoryPort';

/**
 * Bridges to food-recognition's public RecognizeFromText use-case and can also
 * revise the latest persisted meal draft in the conversation.
 */
export class ProposeMealLogTool {
  readonly definition: LlmToolDefinition = {
    name: 'propose_meal_log',
    description:
      'Use this when the user wants a meal estimate, wants to log a meal from text, asks about spoon/gram conversions for the current meal, or wants to correct an existing meal draft/photo estimate. This tool creates a new draft or revises the current draft; it never saves automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: "The user's latest meal description or correction, for example '10 kasik pilav yedim' or '2 cay kasigi yag ekle'",
        },
        mode: {
          type: 'string',
          enum: ['new', 'revise'],
          description: "Use 'new' for a fresh meal draft, 'revise' to update the current draft/photo estimate",
        },
      },
      required: ['description'],
      additionalProperties: false,
    },
  };

  readonly yieldsProposal = true;

  constructor(
    private readonly recognizeFromText: RecognizeFromText,
    private readonly conversationRepository: ConversationRepositoryPort,
    private readonly reviser: LlmMealProposalReviser = new LlmMealProposalReviser(),
  ) {}

  async execute(
    userId: string,
    input: Record<string, unknown>,
    context: { conversationId: string; messages: LlmMessage[] },
  ): Promise<MealLogProposal> {
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const mode = input.mode === 'new' || input.mode === 'revise' ? input.mode : undefined;
    if (!description) {
      throw new ValidationError('INVALID_TOOL_INPUT', "propose_meal_log requires a non-empty 'description'");
    }

    const conversation = await this.conversationRepository.findById(userId, context.conversationId);
    const latestProposal = conversation ? findLatestProposal(conversation.messages) : null;

    if (mode === 'revise' && latestProposal) {
      return this.reviser.revise(latestProposal, description);
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
