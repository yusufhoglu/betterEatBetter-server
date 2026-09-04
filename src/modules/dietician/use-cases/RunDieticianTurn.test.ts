import { IntegrationError } from '../../../shared/errors/IntegrationError';
import type { LlmMessage } from '../../../shared/llm/types';
import type { DieticianStreamChunk } from '../domain/DieticianStreamChunk';
import type { MealLogProposal } from '../domain/MealLogProposal';
import type { MealRating } from '../domain/MealRating';
import type { Recipe } from '../domain/Recipe';
import {
  FakeDailySnapshotPort,
  FakePlanContextPort,
} from '../test-utils/fakes/FakeContextPorts';
import { FakeLlmDieticianPort } from '../test-utils/fakes/FakeLlmDieticianPort';
import { InMemoryDieticianConversationRepository } from '../test-utils/fakes/InMemoryDieticianConversationRepository';
import { RunDieticianTurn } from './RunDieticianTurn';
import type { DieticianTool } from './tools/DieticianTool';

const TODAY = new Date('2026-09-03T00:00:00.000Z');

class FakeDataTool implements DieticianTool {
  readonly calls: Array<Record<string, unknown>> = [];
  readonly definition = { name: 'get_meal_data', description: 'fake', inputSchema: { type: 'object' } };
  constructor(private readonly result: unknown = { consumed: { calories: 1200 } }) {}
  async execute(_userId: string, input: Record<string, unknown>): Promise<unknown> {
    this.calls.push(input);
    return this.result;
  }
}

class FakeProposeTool implements DieticianTool {
  readonly calls: Array<Record<string, unknown>> = [];
  readonly yieldsCard = 'proposal' as const;
  readonly definition = { name: 'propose_meal_log', description: 'fake', inputSchema: { type: 'object' } };
  constructor(private readonly result: MealLogProposal) {}
  async execute(_userId: string, input: Record<string, unknown>): Promise<MealLogProposal> {
    this.calls.push(input);
    return this.result;
  }
}

class FakeRateMealTool implements DieticianTool {
  readonly calls: Array<Record<string, unknown>> = [];
  readonly yieldsCard = 'rating' as const;
  readonly definition = { name: 'rate_meal', description: 'fake', inputSchema: { type: 'object' } };
  constructor(private readonly result: MealRating) {}
  async execute(_userId: string, input: Record<string, unknown>): Promise<MealRating> {
    this.calls.push(input);
    return this.result;
  }
}

class FakeRecipeTool implements DieticianTool {
  readonly calls: Array<Record<string, unknown>> = [];
  readonly yieldsCard = 'recipe' as const;
  readonly definition = { name: 'provide_recipe', description: 'fake', inputSchema: { type: 'object' } };
  constructor(private readonly result: Recipe) {}
  async execute(_userId: string, input: Record<string, unknown>): Promise<Recipe> {
    this.calls.push(input);
    return this.result;
  }
}

const fakeProposal: MealLogProposal = {
  rawDescription: 'chicken sandwich',
  entries: [
    {
      id: 'entry-1',
      userId: 'user-1',
      source: 'text',
      status: 'completed',
      items: [{ name: 'Sandwich', portionGrams: 220, calories: 450, proteinGrams: 30, carbsGrams: 40, fatGrams: 15 }],
      macros: { totalCalories: 450, totalProteinGrams: 30, totalCarbsGrams: 40, totalFatGrams: 15 },
      needsUserAction: false,
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
    },
  ],
};

const fakeRating: MealRating = {
  mealName: 'chicken sandwich',
  score: 6.5,
  macros: { totalCalories: 450, totalProteinGrams: 30, totalCarbsGrams: 40, totalFatGrams: 15 },
  flaggedMacro: 'carbs',
  goodNote: 'Good protein for the portion.',
  fixNote: 'Swap the white bread for whole grain.',
};

const fakeRecipe: Recipe = {
  title: 'High-protein chicken bowl',
  timeMinutes: 20,
  servings: 1,
  calories: 550,
  proteinGrams: 45,
  carbsGrams: 40,
  fatGrams: 18,
  ingredients: [{ name: 'chicken breast', amount: '150g' }],
  steps: ['Grill the chicken.', 'Serve over rice with vegetables.'],
};

function build(overrides: {
  tools?: DieticianTool[];
  digestEveryNTurns?: number;
  maxGatherTurns?: number;
} = {}) {
  const llm = new FakeLlmDieticianPort();
  const repository = new InMemoryDieticianConversationRepository();
  const planContext = new FakePlanContextPort();
  const snapshot = new FakeDailySnapshotPort();
  const runTurn = new RunDieticianTurn(
    llm,
    repository,
    planContext,
    snapshot,
    overrides.tools ?? [new FakeDataTool()],
    overrides.maxGatherTurns ?? 3,
    overrides.digestEveryNTurns ?? 6,
    20,
  );
  return { llm, repository, planContext, snapshot, runTurn };
}

async function collect(stream: AsyncIterable<DieticianStreamChunk>): Promise<DieticianStreamChunk[]> {
  const chunks: DieticianStreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function textOf(chunks: DieticianStreamChunk[]): string {
  return chunks
    .filter((c): c is Extract<DieticianStreamChunk, { type: 'text' }> => c.type === 'text')
    .map((c) => c.delta)
    .join('');
}

describe('RunDieticianTurn', () => {
  it('smalltalk lane: cheap stream only, no gathering and no prime model', async () => {
    const { llm, runTurn, repository } = build();
    llm.setIntent('smalltalk');
    llm.setSmalltalkChunks(['Hey there!']);

    const chunks = await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'hi', today: TODAY }));

    expect(textOf(chunks)).toBe('Hey there!');
    expect(llm.classifyCalls).toHaveLength(1);
    expect(llm.gatherCalls).toHaveLength(0);
    expect(llm.adviceCalls).toHaveLength(0);
    expect(llm.smalltalkCalls).toHaveLength(1);

    const conversation = await repository.findById('user-1', 'c1');
    expect(conversation?.messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hey there!' },
    ]);
    expect(conversation?.turnCount).toBe(1);
  });

  it('injects the plan + snapshot context block as a system message on the advice lane', async () => {
    const { llm, runTurn } = build();
    llm.setIntent('advice');
    llm.setGatherResults([{ content: '' }]);

    await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'what should I eat?', today: TODAY }));

    const gatherMessages = llm.gatherCalls[0]!.messages;
    const systemBlock = gatherMessages.find((m: LlmMessage) => m.role === 'system');
    expect(systemBlock?.content).toContain('User plan:');
    expect(systemBlock?.content).toContain('Remaining vs. target: 600 kcal');
  });

  it('assisted lane: runs the gather loop then streams the prime advice model', async () => {
    const dataTool = new FakeDataTool({ consumed: { calories: 1200 } });
    const { llm, runTurn } = build({ tools: [dataTool] });
    llm.setIntent('advice');
    llm.setGatherResults([
      { content: '', toolCalls: [{ id: 't1', name: 'get_meal_data', input: { date: '2026-09-03' } }] },
      { content: '' },
    ]);
    llm.setAdviceChunks(['Have grilled chicken and salad.']);

    const chunks = await collect(
      runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'dinner ideas?', today: TODAY }),
    );

    expect(dataTool.calls).toEqual([{ date: '2026-09-03' }]);
    expect(llm.gatherCalls).toHaveLength(2);
    expect(llm.adviceCalls).toHaveLength(1);
    expect(textOf(chunks)).toBe('Have grilled chicken and salad.');
    const toolResult = llm.adviceCalls[0]!.find((m: LlmMessage) => m.role === 'tool');
    expect(toolResult?.content).toBe(JSON.stringify({ consumed: { calories: 1200 } }));
  });

  it('only arms propose_meal_log for the log_help intent', async () => {
    const proposeTool = new FakeProposeTool(fakeProposal);
    const dataTool = new FakeDataTool();
    const { llm, runTurn } = build({ tools: [dataTool, proposeTool] });
    llm.setIntent('advice');
    llm.setGatherResults([{ content: '' }]);

    await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'advice pls', today: TODAY }));

    const toolNames = llm.gatherCalls[0]!.tools.map((t) => t.name);
    expect(toolNames).toEqual(['get_meal_data']);
  });

  it('log_help: yields a proposal chunk immediately, persists it, then streams advice', async () => {
    const proposeTool = new FakeProposeTool(fakeProposal);
    const { llm, runTurn, repository } = build({ tools: [proposeTool] });
    llm.setIntent('log_help');
    llm.setGatherResults([
      { content: '', toolCalls: [{ id: 't1', name: 'propose_meal_log', input: { description: 'chicken sandwich' } }] },
      { content: '' },
    ]);
    llm.setAdviceChunks(['Logged as a draft — confirm when ready.']);

    const chunks = await collect(
      runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'I ate a chicken sandwich', today: TODAY }),
    );

    expect(chunks[0]).toEqual({ type: 'proposal', proposal: fakeProposal });
    expect(textOf(chunks)).toBe('Logged as a draft — confirm when ready.');

    const conversation = await repository.findById('user-1', 'c1');
    expect(conversation?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant']);
    expect(conversation?.messages[1]?.proposal).toMatchObject({ rawDescription: 'chicken sandwich' });
    expect(conversation?.messages[2]?.content).toBe('Logged as a draft — confirm when ready.');
  });

  it('rate_meal and provide_recipe stay armed regardless of intent, unlike propose_meal_log', async () => {
    const proposeTool = new FakeProposeTool(fakeProposal);
    const rateTool = new FakeRateMealTool(fakeRating);
    const recipeTool = new FakeRecipeTool(fakeRecipe);
    const { llm, runTurn } = build({ tools: [proposeTool, rateTool, recipeTool] });
    llm.setIntent('advice');
    llm.setGatherResults([{ content: '' }]);

    await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'advice pls', today: TODAY }));

    const toolNames = llm.gatherCalls[0]!.tools.map((t) => t.name);
    expect(toolNames).toEqual(['rate_meal', 'provide_recipe']);
  });

  it('rate_meal: yields a rating chunk immediately, persists it, then streams advice', async () => {
    const rateTool = new FakeRateMealTool(fakeRating);
    const { llm, runTurn, repository } = build({ tools: [rateTool] });
    llm.setIntent('advice');
    llm.setGatherResults([
      { content: '', toolCalls: [{ id: 't1', name: 'rate_meal', input: { description: 'chicken sandwich' } }] },
      { content: '' },
    ]);
    llm.setAdviceChunks(['Not bad — swap the bread next time.']);

    const chunks = await collect(
      runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'rate my chicken sandwich', today: TODAY }),
    );

    expect(chunks[0]).toEqual({ type: 'rating', rating: fakeRating });
    expect(textOf(chunks)).toBe('Not bad — swap the bread next time.');

    const conversation = await repository.findById('user-1', 'c1');
    expect(conversation?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant']);
    expect(conversation?.messages[1]?.rating).toEqual(fakeRating);
    expect(conversation?.messages[1]?.content).toBe('');
  });

  it('provide_recipe: yields a recipe chunk immediately, persists it, then streams advice', async () => {
    const recipeTool = new FakeRecipeTool(fakeRecipe);
    const { llm, runTurn, repository } = build({ tools: [recipeTool] });
    llm.setIntent('advice');
    llm.setGatherResults([
      { content: '', toolCalls: [{ id: 't1', name: 'provide_recipe', input: { request: 'high protein dinner' } }] },
      { content: '' },
    ]);
    llm.setAdviceChunks(['Here is a quick one.']);

    const chunks = await collect(
      runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'give me a high protein dinner recipe', today: TODAY }),
    );

    expect(chunks[0]).toEqual({ type: 'recipe', recipe: fakeRecipe });
    expect(textOf(chunks)).toBe('Here is a quick one.');

    const conversation = await repository.findById('user-1', 'c1');
    expect(conversation?.messages[1]?.recipe).toEqual(fakeRecipe);
    expect(conversation?.messages[1]?.content).toBe('');
  });

  it('forces synthesis once maxGatherTurns is reached', async () => {
    const dataTool = new FakeDataTool();
    const { llm, runTurn } = build({ tools: [dataTool], maxGatherTurns: 2 });
    llm.setIntent('advice');
    llm.setGatherResults([
      { content: '', toolCalls: [{ id: 't', name: 'get_meal_data', input: {} }] },
    ]);
    llm.setAdviceChunks(['Answer with what I have.']);

    const chunks = await collect(
      runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'loop me', today: TODAY }),
    );

    expect(llm.gatherCalls).toHaveLength(2);
    expect(dataTool.calls).toHaveLength(2);
    expect(llm.adviceCalls).toHaveLength(1);
    expect(textOf(chunks)).toBe('Answer with what I have.');
  });

  it('refreshes the digest once the turn count reaches the threshold', async () => {
    const { llm, runTurn, repository } = build({ digestEveryNTurns: 1 });
    llm.setIntent('smalltalk');
    llm.setDigest({
      goalsRecap: 'g',
      adviceGivenRecap: 'a',
      openThreads: 'o',
      learnedPreferences: 'p',
    });

    await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'hi', today: TODAY }));

    expect(llm.summarizeCalls).toHaveLength(1);
    const conversation = await repository.findById('user-1', 'c1');
    expect(conversation?.digest).toEqual({ goalsRecap: 'g', adviceGivenRecap: 'a', openThreads: 'o', learnedPreferences: 'p' });
    expect(conversation?.digestTurn).toBe(1);
  });

  it('does not refresh the digest before the threshold', async () => {
    const { llm, runTurn } = build({ digestEveryNTurns: 6 });
    llm.setIntent('smalltalk');

    await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'hi', today: TODAY }));

    expect(llm.summarizeCalls).toHaveLength(0);
  });

  it('a digest failure is swallowed and does not fail the turn', async () => {
    const { llm, runTurn, repository } = build({ digestEveryNTurns: 1 });
    llm.setIntent('smalltalk');
    llm.setSmalltalkChunks(['Hello!']);
    llm.setSummarizeError(new Error('summarizer down'));

    const chunks = await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'hi', today: TODAY }));

    expect(textOf(chunks)).toBe('Hello!');
    const conversation = await repository.findById('user-1', 'c1');
    expect(conversation?.digest).toBeNull();
    expect(conversation?.turnCount).toBe(1);
  });

  it('does NOT persist a partial reply and reports STREAM_INTERRUPTED when the stream breaks mid-flight', async () => {
    const { llm, runTurn, repository } = build();
    llm.setIntent('smalltalk');
    llm.setSmalltalkChunks(['Partial ']);
    llm.setStreamError(new Error('connection dropped'));

    let caught: unknown;
    try {
      await collect(runTurn.execute({ userId: 'user-1', conversationId: 'c1', content: 'hi', today: TODAY }));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(IntegrationError);
    expect((caught as IntegrationError).code).toBe('STREAM_INTERRUPTED');

    const conversation = await repository.findById('user-1', 'c1');
    expect(conversation?.messages.map((m) => m.role)).toEqual(['user']);
    expect(conversation?.turnCount).toBe(0);
  });
});
