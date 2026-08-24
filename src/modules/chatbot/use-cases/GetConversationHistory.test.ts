import { encodeProposalMessage } from '../domain/proposalMessageCodec';
import { InMemoryConversationRepository } from '../test-utils/fakes/InMemoryConversationRepository';
import { GetConversationHistory } from './GetConversationHistory';

describe('GetConversationHistory', () => {
  it('returns the conversation with its ordered messages', async () => {
    const repository = new InMemoryConversationRepository();
    await repository.findOrCreate('user-1', 'conv-1');
    await repository.appendMessage('conv-1', 'user', 'Hi');
    await repository.appendMessage('conv-1', 'assistant', encodeProposalMessage({ rawDescription: 'ayran', entries: [] }));
    await repository.appendMessage('conv-1', 'assistant', 'Hello!');

    const useCase = new GetConversationHistory(repository);
    const conversation = await useCase.execute('user-1', 'conv-1');

    expect(conversation.id).toBe('conv-1');
    expect(conversation.messages.map((m) => ({ role: m.role, content: m.content, proposal: m.proposal }))).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: '', proposal: { rawDescription: 'ayran', entries: [] } },
      { role: 'assistant', content: 'Hello!' },
    ]);
  });

  it('throws NotFoundError when the conversation does not exist', async () => {
    const repository = new InMemoryConversationRepository();
    const useCase = new GetConversationHistory(repository);

    await expect(useCase.execute('user-1', 'does-not-exist')).rejects.toThrow('Conversation was not found');
  });

  it('throws NotFoundError when the conversation belongs to a different user', async () => {
    const repository = new InMemoryConversationRepository();
    await repository.findOrCreate('owner', 'conv-1');

    const useCase = new GetConversationHistory(repository);

    await expect(useCase.execute('someone-else', 'conv-1')).rejects.toThrow('Conversation was not found');
  });
});
