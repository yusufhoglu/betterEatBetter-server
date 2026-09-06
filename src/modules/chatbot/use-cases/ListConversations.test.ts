import { encodeProposalMessage } from '../domain/proposalMessageCodec';
import { InMemoryConversationRepository } from '../test-utils/fakes/InMemoryConversationRepository';
import { ListConversations, MAX_CONVERSATION_LIST_LIMIT } from './ListConversations';

async function seed(repository: InMemoryConversationRepository, userId: string, id: string, texts: string[]): Promise<void> {
  await repository.findOrCreate(userId, id);
  for (const [index, text] of texts.entries()) {
    await repository.appendMessage(id, index % 2 === 0 ? 'user' : 'assistant', text);
  }
}

describe('ListConversations', () => {
  it('returns only the caller\'s non-empty conversations, newest activity first', async () => {
    const repository = new InMemoryConversationRepository();
    await seed(repository, 'user-1', 'older', ['first question', 'an answer']);
    await seed(repository, 'user-1', 'newer', ['second question']);
    await repository.findOrCreate('user-1', 'never-messaged');
    await seed(repository, 'user-2', 'someone-else', ['not mine']);

    const result = await new ListConversations(repository).execute('user-1');

    expect(result.map((c) => c.id)).toEqual(['newer', 'older']);
    expect(result[0]).toMatchObject({ title: 'second question', messageCount: 1 });
    expect(result[1]).toMatchObject({ title: 'first question', preview: 'an answer', messageCount: 2 });
  });

  it('derives a null title/preview from proposal-only content', async () => {
    const repository = new InMemoryConversationRepository();
    await repository.findOrCreate('user-1', 'conv-1');
    await repository.appendMessage('conv-1', 'assistant', encodeProposalMessage({ rawDescription: 'ayran', entries: [] }));

    const [summary] = await new ListConversations(repository).execute('user-1');

    expect(summary).toMatchObject({ id: 'conv-1', title: null, preview: null, messageCount: 1 });
  });

  it('caps the limit', async () => {
    const repository = new InMemoryConversationRepository();
    const spy = jest.spyOn(repository, 'listByUser');

    await new ListConversations(repository).execute('user-1', 10_000);

    expect(spy).toHaveBeenCalledWith('user-1', MAX_CONVERSATION_LIST_LIMIT);
  });
});
