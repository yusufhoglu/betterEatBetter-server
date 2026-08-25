import { encodeProposalMessage } from '../domain/proposalMessageCodec';
import { InMemoryConversationRepository } from '../test-utils/fakes/InMemoryConversationRepository';
import { ConfirmMealProposal } from './ConfirmMealProposal';
import { LogMealEntries } from '../../nutrition-logging/use-cases/LogMealEntries';
import { ReplaceMealSlotEntries } from '../../nutrition-logging/use-cases/ReplaceMealSlotEntries';
import { InMemoryMealItemRepository } from '../../nutrition-logging/test-utils/fakes/InMemoryMealItemRepository';
import type { TransactionClient } from '../../../shared/persistence/transaction';

const tx = { label: 'test-transaction' } as unknown as TransactionClient;
const runInTransaction = async <T>(fn: (innerTx: TransactionClient) => Promise<T>): Promise<T> => fn(tx);

describe('ConfirmMealProposal', () => {
  it('creates meal entries that retain mealPhotoId from photo-seeded proposals', async () => {
    const conversationRepository = new InMemoryConversationRepository();
    const mealItemRepository = new InMemoryMealItemRepository();
    const eventPublisher = {
      publishLogged: jest.fn().mockResolvedValue(undefined),
      publishUpdated: jest.fn().mockResolvedValue(undefined),
    };
    const logMealEntries = new LogMealEntries(mealItemRepository, eventPublisher, runInTransaction);
    const replaceMealSlotEntries = new ReplaceMealSlotEntries(mealItemRepository, eventPublisher, runInTransaction);
    const useCase = new ConfirmMealProposal(conversationRepository, logMealEntries, replaceMealSlotEntries);

    await conversationRepository.findOrCreate('user-1', 'conv-1');
    await conversationRepository.appendMessage(
      'conv-1',
      'assistant',
      encodeProposalMessage({
        rawDescription: 'Photo estimate from meal photo photo-1',
        entries: [
          {
            id: 'photo-1',
            userId: 'user-1',
            source: 'photo',
            status: 'completed',
            items: [
              {
                name: 'Omelette',
                portionGrams: 150,
                calories: 320,
                proteinGrams: 22,
                carbsGrams: 8,
                fatGrams: 21,
              },
            ],
            macros: {
              totalCalories: 320,
              totalProteinGrams: 22,
              totalCarbsGrams: 8,
              totalFatGrams: 21,
            },
            needsUserAction: false,
            createdAt: new Date('2026-08-25T08:00:00.000Z'),
          },
        ],
      }),
    );

    const mealItem = await useCase.execute({
      userId: 'user-1',
      conversationId: 'conv-1',
      date: new Date('2026-08-25T00:00:00.000Z'),
      mealType: 'breakfast',
      applyMode: 'append',
    });

    expect(mealItem.entries).toEqual([
      expect.objectContaining({
        mealPhotoId: 'photo-1',
        name: 'Omelette',
        source: 'photo',
      }),
    ]);
  });
});
