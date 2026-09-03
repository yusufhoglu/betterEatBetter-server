import { ValidationError } from '../../../shared/errors/ValidationError';
import type { MealItem, MealType } from '../../nutrition-logging/domain/MealItem';
import type { LogMealEntries } from '../../nutrition-logging/use-cases/LogMealEntries';
import type { ReplaceMealSlotEntries } from '../../nutrition-logging/use-cases/ReplaceMealSlotEntries';
import { proposalToLoggedMealEntries, requireLatestProposal } from '../domain/mealProposalUtils';
import type { DieticianConversationRepositoryPort } from '../ports/DieticianConversationRepositoryPort';

export interface ConfirmMealProposalInput {
  userId: string;
  conversationId: string;
  date: Date;
  mealType: MealType;
  applyMode: 'append' | 'replace_meal_slot';
}

/**
 * The only write the dietician module ever triggers, and only in response to an
 * explicit user confirm. Everything else is read-only / advice.
 */
export class ConfirmMealProposal {
  constructor(
    private readonly conversationRepository: DieticianConversationRepositoryPort,
    private readonly logMealEntries: LogMealEntries,
    private readonly replaceMealSlotEntries: ReplaceMealSlotEntries,
  ) {}

  async execute(input: ConfirmMealProposalInput): Promise<MealItem> {
    const conversation = await this.conversationRepository.findById(input.userId, input.conversationId);
    if (!conversation) {
      throw new ValidationError('DIETICIAN_CONVERSATION_NOT_FOUND', 'Conversation was not found');
    }

    const proposal = requireLatestProposal(conversation);
    if (!proposal) {
      throw new ValidationError('MEAL_PROPOSAL_NOT_FOUND', 'No meal proposal is available to confirm');
    }

    const entries = proposalToLoggedMealEntries(proposal);
    if (entries.length === 0) {
      throw new ValidationError('MEAL_PROPOSAL_EMPTY', 'Meal proposal has no entries to confirm');
    }

    const mealItem =
      input.applyMode === 'replace_meal_slot'
        ? await this.replaceMealSlotEntries.execute({
            userId: input.userId,
            date: input.date,
            mealType: input.mealType,
            entries,
          })
        : await this.logMealEntries.execute({
            userId: input.userId,
            date: input.date,
            mealType: input.mealType,
            entries,
          });

    await this.conversationRepository.appendMessage(
      input.conversationId,
      'assistant',
      `Meal proposal confirmed and saved to ${input.mealType}.`,
      'live',
    );

    return mealItem;
  }
}
