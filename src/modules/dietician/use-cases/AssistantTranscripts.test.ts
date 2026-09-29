import { encodeRatingMessage } from '../domain/cardMessageCodec';
import type { MealRating } from '../domain/MealRating';
import { FakeLlmDieticianPort } from '../test-utils/fakes/FakeLlmDieticianPort';
import { InMemoryDieticianConversationRepository } from '../test-utils/fakes/InMemoryDieticianConversationRepository';
import { AssistantTranscripts } from './AssistantTranscripts';
import { PreviewAssistantReply } from './PreviewAssistantReply';

const RATING: MealRating = {
  mealName: 'Menemen',
  score: 7,
  macros: { totalCalories: 350, totalProteinGrams: 18, totalCarbsGrams: 12, totalFatGrams: 24 },
  flaggedMacro: 'fat',
  goodNote: 'Protein iyi.',
  fixNote: 'Az yağ.',
};

describe('AssistantTranscripts', () => {
  async function seed() {
    const repository = new InMemoryDieticianConversationRepository();
    await repository.findOrCreate('client', 'c1');
    await repository.appendMessage('c1', 'user', 'private, before the dietitian', 'live');
    const question = await repository.appendMessage('c1', 'user', 'Menemen nasıl?', 'live', 'dyt-1');
    const card = await repository.appendMessage('c1', 'assistant', encodeRatingMessage(RATING), 'live', 'dyt-1');
    const reply = await repository.appendMessage('c1', 'assistant', 'Güzel seçim.', 'live', 'dyt-1');
    return { transcripts: new AssistantTranscripts(repository), question, card, reply };
  }

  it('lists only conversations and messages stamped for the dietitian', async () => {
    const { transcripts } = await seed();
    expect(await transcripts.list('client', 'dyt-1', new Date(0), 10)).toMatchObject([
      { id: 'c1', title: 'Menemen nasıl?', messageCount: 3 },
    ]);
    expect(await transcripts.list('client', 'dyt-2', new Date(0), 10)).toEqual([]);
  });

  it('turns cards into a readable summary', async () => {
    const { transcripts, card } = await seed();
    const messages = await transcripts.get('client', 'c1', 'dyt-1', new Date(0));
    expect(messages?.map((m) => m.content || m.card?.title)).toEqual(['Menemen nasıl?', 'Menemen — 7/10', 'Güzel seçim.']);
    expect(messages?.find((m) => m.id === card.id)?.card).toEqual({ kind: 'rating', title: 'Menemen — 7/10' });
    expect(await transcripts.get('someone-else', 'c1', 'dyt-1', new Date(0))).toBeNull();
  });

  it("only accepts the dietitian's own assistant replies as correction sources", async () => {
    const { transcripts, question, reply } = await seed();
    expect(await transcripts.findAssistantMessage(reply.id, 'dyt-1')).toEqual({ id: reply.id, content: 'Güzel seçim.' });
    expect(await transcripts.findAssistantMessage(reply.id, 'dyt-2')).toBeNull();
    expect(await transcripts.findAssistantMessage(question.id, 'dyt-1')).toBeNull();
  });
});

describe('PreviewAssistantReply', () => {
  it('sends the persona block and the preview note ahead of the chat', async () => {
    const llm = new FakeLlmDieticianPort();
    const reply = await new PreviewAssistantReply(llm).execute(
      {
        dietitianId: 'dyt-1',
        dietitianName: 'Ayşe',
        assistantName: 'Ayşe · AI asistan',
        addressForm: null,
        tone: null,
        approach: null,
        rules: [],
        avoid: [],
        handoffMessage: null,
        clientInstructions: null,
        examples: [],
      },
      [{ role: 'user', content: 'Akşam ne yiyeyim?' }],
    );

    expect(reply).toBe('preview reply');
    const [persona, note, user] = llm.previewCalls[0]!;
    expect(persona).toMatchObject({ role: 'system' });
    expect(persona!.content).toContain('AI assistant of dietitian Ayşe');
    expect(note!.content).toContain('This is a preview');
    expect(user).toEqual({ role: 'user', content: 'Akşam ne yiyeyim?' });
  });
});
