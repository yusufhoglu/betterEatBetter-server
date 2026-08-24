import { ValidationError } from '../../../shared/errors/ValidationError';
import type { FoodEntryRepositoryPort } from '../../food-recognition/ports/FoodEntryRepositoryPort';
import { foodEntryToProposal } from '../domain/mealProposalUtils';
import { encodeProposalMessage } from '../domain/proposalMessageCodec';
import type { ConversationRepositoryPort } from '../ports/ConversationRepositoryPort';
import type { MealLogProposal } from '../domain/MealLogProposal';

export interface SeedPhotoMealProposalInput {
  userId: string;
  conversationId: string;
  mealPhotoId: string;
}

export class SeedPhotoMealProposal {
  constructor(
    private readonly conversationRepository: ConversationRepositoryPort,
    private readonly foodEntryRepository: FoodEntryRepositoryPort,
  ) {}

  async execute(input: SeedPhotoMealProposalInput): Promise<MealLogProposal> {
    const foodEntry = await this.foodEntryRepository.findById(input.mealPhotoId);
    if (!foodEntry || foodEntry.userId !== input.userId) {
      throw new ValidationError('FOOD_ENTRY_NOT_FOUND', 'Photo meal estimate was not found');
    }

    if (foodEntry.status === 'processing') {
      throw new ValidationError('FOOD_ENTRY_NOT_READY', 'Photo meal estimate is still processing');
    }

    if (foodEntry.status === 'failed') {
      throw new ValidationError('FOOD_ENTRY_FAILED', 'Photo meal estimate failed and cannot seed chat');
    }

    await this.conversationRepository.findOrCreate(input.userId, input.conversationId);

    const proposal = foodEntryToProposal(
      foodEntry,
      `Photo estimate from meal photo ${input.mealPhotoId}`,
    );

    await this.conversationRepository.appendMessage(
      input.conversationId,
      'assistant',
      encodeProposalMessage(proposal),
    );

    return proposal;
  }
}
