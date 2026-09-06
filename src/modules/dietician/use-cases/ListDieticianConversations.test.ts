import { encodeRecipeMessage } from '../domain/cardMessageCodec';
import { InMemoryDieticianConversationRepository } from '../test-utils/fakes/InMemoryDieticianConversationRepository';
import { ListDieticianConversations, MAX_DIETICIAN_CONVERSATION_LIST_LIMIT } from './ListDieticianConversations';

describe('ListDieticianConversations', () => {
  it('returns only the caller\'s non-empty threads, newest activity first', async () => {
    const repository = new InMemoryDieticianConversationRepository();

    await repository.findOrCreate('user-1', 'older');
    await repository.appendMessage('older', 'user', 'help me plan dinner');
    await repository.appendMessage('older', 'assistant', 'Grilled chicken and salad.');

    await repository.findOrCreate('user-1', 'newer');
    await repository.appendMessage('newer', 'user', 'am I on track today?');

    await repository.findOrCreate('user-1', 'never-messaged');
    await repository.findOrCreate('user-2', 'not-mine');
    await repository.appendMessage('not-mine', 'user', 'secret');

    const result = await new ListDieticianConversations(repository).execute('user-1');

    expect(result.map((c) => c.id)).toEqual(['newer', 'older']);
    expect(result[0]).toMatchObject({ title: 'am I on track today?', messageCount: 1, turnCount: 0 });
    expect(result[1]).toMatchObject({ title: 'help me plan dinner', preview: 'Grilled chicken and salad.' });
  });

  it('yields a null title/preview for card-only content', async () => {
    const repository = new InMemoryDieticianConversationRepository();
    await repository.findOrCreate('user-1', 'conv-1');
    await repository.appendMessage(
      'conv-1',
      'assistant',
      encodeRecipeMessage({
        title: 'Overnight oats',
        timeMinutes: 5,
        servings: 1,
        calories: 320,
        proteinGrams: 12,
        carbsGrams: 44,
        fatGrams: 9,
        ingredients: [],
        steps: [],
      }),
    );

    const [summary] = await new ListDieticianConversations(repository).execute('user-1');

    expect(summary).toMatchObject({ id: 'conv-1', title: null, preview: null });
  });

  it('caps the limit', async () => {
    const repository = new InMemoryDieticianConversationRepository();
    const spy = jest.spyOn(repository, 'listByUser');

    await new ListDieticianConversations(repository).execute('user-1', 5000);

    expect(spy).toHaveBeenCalledWith('user-1', MAX_DIETICIAN_CONVERSATION_LIST_LIMIT);
  });
});
