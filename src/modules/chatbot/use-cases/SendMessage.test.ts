import { IntegrationError } from '../../../shared/errors/IntegrationError';
import type { ChatStreamChunk } from '../domain/ChatStreamChunk';
import type { MealLogProposal } from '../domain/MealLogProposal';
import { FakeLlmChatPort } from '../test-utils/fakes/FakeLlmChatPort';
import { InMemoryConversationRepository } from '../test-utils/fakes/InMemoryConversationRepository';
import { SendMessage, type ChatTool } from './SendMessage';

class FakeChatTool implements ChatTool {
  readonly calls: Array<{ userId: string; input: Record<string, unknown> }> = [];

  readonly definition = {
    name: 'get_meal_data',
    description: 'fake tool',
    inputSchema: { type: 'object' },
  };

  constructor(private readonly result: unknown = { ok: true }) {}

  async execute(userId: string, input: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ userId, input });
    return this.result;
  }
}

class FakeProposeMealLogTool implements ChatTool {
  readonly calls: Array<{ userId: string; input: Record<string, unknown> }> = [];
  readonly yieldsProposal = true;

  readonly definition = {
    name: 'propose_meal_log',
    description: 'fake propose_meal_log tool',
    inputSchema: { type: 'object' },
  };

  constructor(private readonly result: MealLogProposal) {}

  async execute(userId: string, input: Record<string, unknown>): Promise<MealLogProposal> {
    this.calls.push({ userId, input });
    return this.result;
  }
}

async function collectChunks(stream: AsyncIterable<ChatStreamChunk>): Promise<ChatStreamChunk[]> {
  const chunks: ChatStreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function textOf(chunks: ChatStreamChunk[]): string {
  return chunks
    .filter((chunk): chunk is Extract<ChatStreamChunk, { type: 'text' }> => chunk.type === 'text')
    .map((chunk) => chunk.delta)
    .join('');
}

const fakeProposal: MealLogProposal = {
  rawDescription: 'tavuklu sandvic',
  entries: [
    {
      id: 'entry-1',
      userId: 'user-1',
      source: 'text',
      status: 'completed',
      items: [{ name: 'Tavuklu sandvic', portionGrams: 220, calories: 450, proteinGrams: 30, carbsGrams: 40, fatGrams: 15 }],
      macros: { totalCalories: 450, totalProteinGrams: 30, totalCarbsGrams: 40, totalFatGrams: 15 },
      needsUserAction: false,
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
    },
  ],
};

describe('SendMessage', () => {
  it('streams the final reply directly when the model calls no tools', async () => {
    const llmChatPort = new FakeLlmChatPort();
    llmChatPort.setTurnResults([{ content: 'Hi there!' }]);
    llmChatPort.setStreamChunks(['Hi', ' there!']);
    const repository = new InMemoryConversationRepository();
    const sendMessage = new SendMessage(llmChatPort, repository);

    const stream = sendMessage.execute({ userId: 'user-1', conversationId: 'conv-1', content: 'Hello' });
    const chunks = await collectChunks(stream);

    expect(textOf(chunks)).toBe('Hi there!');
    expect(chunks.every((c) => c.type === 'text')).toBe(true);
    expect(llmChatPort.sendTurnCalls).toHaveLength(1);
    expect(llmChatPort.streamFinalReplyCalls).toHaveLength(1);
  });

  it('executes a called tool, appends its result to history, and calls sendTurn a second time', async () => {
    const llmChatPort = new FakeLlmChatPort();
    llmChatPort.setTurnResults([
      { content: '', toolCalls: [{ id: 'call_1', name: 'get_meal_data', input: { date: '2026-08-24' } }] },
      { content: 'You ate 320 calories today.' },
    ]);
    llmChatPort.setStreamChunks(['You ate 320 calories today.']);
    const repository = new InMemoryConversationRepository();
    const tool = new FakeChatTool({ calories: 320 });
    const sendMessage = new SendMessage(llmChatPort, repository, [tool]);

    const stream = sendMessage.execute({ userId: 'user-1', conversationId: 'conv-1', content: 'How did I eat today?' });
    await collectChunks(stream);

    expect(tool.calls).toEqual([{ userId: 'user-1', input: { date: '2026-08-24' } }]);
    expect(llmChatPort.sendTurnCalls).toHaveLength(2);

    const secondTurnMessages = llmChatPort.sendTurnCalls[1]!.messages;
    expect(secondTurnMessages.some((m) => m.role === 'tool' && m.content === JSON.stringify({ calories: 320 }))).toBe(true);
    expect(secondTurnMessages.some((m) => m.role === 'assistant' && m.toolCalls?.[0]?.name === 'get_meal_data')).toBe(true);
  });

  it('forces a final reply once MAX_TOOL_TURNS is reached, without looping forever', async () => {
    const llmChatPort = new FakeLlmChatPort();
    llmChatPort.setTurnResults([
      { content: '', toolCalls: [{ id: 'call_x', name: 'get_meal_data', input: {} }] },
    ]);
    llmChatPort.setStreamChunks(['Final answer.']);
    const repository = new InMemoryConversationRepository();
    const tool = new FakeChatTool();
    const maxToolTurns = 3;
    const sendMessage = new SendMessage(llmChatPort, repository, [tool], maxToolTurns);

    const stream = sendMessage.execute({ userId: 'user-1', conversationId: 'conv-1', content: 'Loop me' });
    const chunks = await collectChunks(stream);

    expect(textOf(chunks)).toBe('Final answer.');
    expect(llmChatPort.sendTurnCalls).toHaveLength(maxToolTurns);
    expect(tool.calls).toHaveLength(maxToolTurns);
    expect(llmChatPort.streamFinalReplyCalls).toHaveLength(1);
  });

  it('persists the full assistant reply once the stream completes', async () => {
    const llmChatPort = new FakeLlmChatPort();
    llmChatPort.setTurnResults([{ content: 'Complete reply' }]);
    llmChatPort.setStreamChunks(['Complete', ' reply']);
    const repository = new InMemoryConversationRepository();
    const sendMessage = new SendMessage(llmChatPort, repository);

    const stream = sendMessage.execute({ userId: 'user-1', conversationId: 'conv-1', content: 'Hello' });
    await collectChunks(stream);

    const conversation = await repository.findById('user-1', 'conv-1');
    expect(conversation?.messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Complete reply' },
    ]);
  });

  it('does NOT persist a partial assistant message and reports STREAM_INTERRUPTED when the stream breaks mid-flight', async () => {
    const llmChatPort = new FakeLlmChatPort();
    llmChatPort.setTurnResults([{ content: 'ignored' }]);
    llmChatPort.setStreamChunks(['Partial ']);
    llmChatPort.setStreamError(new Error('connection dropped'));
    const repository = new InMemoryConversationRepository();
    const sendMessage = new SendMessage(llmChatPort, repository);

    const stream = sendMessage.execute({ userId: 'user-1', conversationId: 'conv-1', content: 'Hello' });

    let caughtError: unknown;
    try {
      await collectChunks(stream);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(IntegrationError);
    expect((caughtError as IntegrationError).code).toBe('STREAM_INTERRUPTED');

    const conversation = await repository.findById('user-1', 'conv-1');
    expect(conversation?.messages.map((m) => m.role)).toEqual(['user']);
  });

  describe('meal-logging proposals', () => {
    it('yields a proposal chunk immediately when ProposeMealLogTool is called, then continues to the final text reply', async () => {
      const llmChatPort = new FakeLlmChatPort();
      llmChatPort.setTurnResults([
        { content: '', toolCalls: [{ id: 'call_1', name: 'propose_meal_log', input: { description: 'tavuklu sandvic' } }] },
        { content: 'Iste bulduklarim, onaylarsan kaydedebilirsin.' },
      ]);
      llmChatPort.setStreamChunks(['Iste bulduklarim, onaylarsan kaydedebilirsin.']);
      const repository = new InMemoryConversationRepository();
      const tool = new FakeProposeMealLogTool(fakeProposal);
      const sendMessage = new SendMessage(llmChatPort, repository, [tool]);

      const stream = sendMessage.execute({ userId: 'user-1', conversationId: 'conv-1', content: 'tavuklu sandvic yedim' });
      const chunks = await collectChunks(stream);

      expect(chunks[0]).toEqual({ type: 'proposal', proposal: fakeProposal });
      expect(chunks.slice(1).every((c) => c.type === 'text')).toBe(true);
      expect(textOf(chunks)).toBe('Iste bulduklarim, onaylarsan kaydedebilirsin.');
      expect(tool.calls).toEqual([{ userId: 'user-1', input: { description: 'tavuklu sandvic' } }]);
      expect(llmChatPort.sendTurnCalls).toHaveLength(2);
      expect(llmChatPort.streamFinalReplyCalls[0]?.at(-1)).toEqual(
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('plain English'),
        }),
      );
    });

    it('persists the proposal for history replay while keeping the final assistant text separate', async () => {
      const llmChatPort = new FakeLlmChatPort();
      llmChatPort.setTurnResults([
        { content: '', toolCalls: [{ id: 'call_1', name: 'propose_meal_log', input: { description: 'tavuklu sandvic' } }] },
        { content: 'Kaydetmek ister misin?' },
      ]);
      llmChatPort.setStreamChunks(['Kaydetmek ister misin?']);
      const repository = new InMemoryConversationRepository();
      const tool = new FakeProposeMealLogTool(fakeProposal);
      const sendMessage = new SendMessage(llmChatPort, repository, [tool]);

      const stream = sendMessage.execute({ userId: 'user-1', conversationId: 'conv-1', content: 'tavuklu sandvic yedim' });
      await collectChunks(stream);

      const conversation = await repository.findById('user-1', 'conv-1');
      expect(conversation?.messages).toHaveLength(3);
      expect(conversation?.messages[0]).toMatchObject({ role: 'user', content: 'tavuklu sandvic yedim' });
      expect(conversation?.messages[1]).toMatchObject({
        role: 'assistant',
        content: '',
        proposal: {
          rawDescription: 'tavuklu sandvic',
          entries: [
            expect.objectContaining({
              id: 'entry-1',
              userId: 'user-1',
              createdAt: '2026-08-24T00:00:00.000Z',
            }),
          ],
        },
      });
      expect(conversation?.messages[2]).toMatchObject({ role: 'assistant', content: 'Kaydetmek ister misin?' });
      expect(conversation?.messages.some((m) => m.content.includes('rawDescription'))).toBe(false);
    });
  });
});

