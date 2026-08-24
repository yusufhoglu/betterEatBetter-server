import type { MealLogProposal } from '../../domain/MealLogProposal';
import { InMemoryConversationRepository } from '../../test-utils/fakes/InMemoryConversationRepository';
import type { TextEstimateResult, TextEstimatorPort } from '../../../food-recognition/ports/TextEstimatorPort';
import { RecognizeFromText } from '../../../food-recognition/use-cases/RecognizeFromText';
import { ProposeMealLogTool } from './ProposeMealLogTool';

function makeEstimator(result: TextEstimateResult): TextEstimatorPort {
  return { estimate: jest.fn().mockResolvedValue(result) };
}

const SUFFICIENT_RESULT: TextEstimateResult = {
  status: 'sufficient',
  items: [
    { name: 'Tavuklu sandvic', portionGrams: 220, calories: 450, proteinGrams: 30, carbsGrams: 40, fatGrams: 15 },
  ],
  macros: { totalCalories: 450, totalProteinGrams: 30, totalCarbsGrams: 40, totalFatGrams: 15 },
};

const INSUFFICIENT_RESULT: TextEstimateResult = {
  status: 'insufficient_data',
  items: [],
  macros: { totalCalories: 0, totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0 },
};

function buildTool(result: TextEstimateResult) {
  const recognizeFromText = new RecognizeFromText(makeEstimator(result));
  return {
    repository: new InMemoryConversationRepository(),
    tool: new ProposeMealLogTool(recognizeFromText, new InMemoryConversationRepository()),
  };
}

function buildContext(conversationId = 'conv-1') {
  return { conversationId, messages: [] };
}

describe('ProposeMealLogTool', () => {
  it('packages the real RecognizeFromText result into a MealLogProposal, without a mealType', async () => {
    const { tool } = buildTool(SUFFICIENT_RESULT);

    const proposal = await tool.execute('user-1', { description: 'tavuklu sandvic yedim', mode: 'new' }, buildContext());

    expect(proposal.rawDescription).toBe('tavuklu sandvic yedim');
    expect(proposal.entries).toHaveLength(1);
    const [entry] = proposal.entries;
    expect(entry).toMatchObject({
      userId: 'user-1',
      source: 'text',
      status: 'completed',
      needsUserAction: false,
      items: SUFFICIENT_RESULT.items,
      macros: SUFFICIENT_RESULT.macros,
    });
    expect(entry).not.toHaveProperty('mealType');
    expect(typeof entry?.id).toBe('string');
    expect(entry?.createdAt).toBeInstanceOf(Date);
  });

  it("marks the entry status 'insufficient_data' when RecognizeFromText flags needsUserAction", async () => {
    const { tool } = buildTool(INSUFFICIENT_RESULT);

    const proposal = await tool.execute('user-1', { description: 'bir seyler yedim', mode: 'new' }, buildContext());

    expect(proposal.entries[0]).toMatchObject({ status: 'insufficient_data', needsUserAction: true });
  });

  it('throws a taxonomy error when description is missing or empty', async () => {
    const { tool } = buildTool(SUFFICIENT_RESULT);

    await expect(tool.execute('user-1', {}, buildContext())).rejects.toThrow();
    await expect(tool.execute('user-1', { description: '   ' }, buildContext())).rejects.toThrow();
  });

  it('exposes an LlmToolDefinition-shaped schema named propose_meal_log and flags itself as proposal-yielding', () => {
    const { tool } = buildTool(SUFFICIENT_RESULT);

    expect(tool.definition.name).toBe('propose_meal_log');
    expect(typeof tool.definition.description).toBe('string');
    expect(tool.definition.inputSchema).toMatchObject({ type: 'object' });
    expect(tool.yieldsProposal).toBe(true);
  });

  it('can revise the latest persisted proposal when mode=revise', async () => {
    const baseProposal: MealLogProposal = {
      rawDescription: 'pilav',
      entries: [
        {
          id: 'entry-1',
          userId: 'user-1',
          source: 'photo',
          status: 'completed',
          items: [{ name: 'Pilav', portionGrams: 180, calories: 240, proteinGrams: 5, carbsGrams: 50, fatGrams: 2 }],
          macros: { totalCalories: 240, totalProteinGrams: 5, totalCarbsGrams: 50, totalFatGrams: 2 },
          needsUserAction: false,
          createdAt: new Date('2026-08-24T00:00:00.000Z'),
        },
      ],
    };

    const repository = new InMemoryConversationRepository();
    await repository.findOrCreate('user-1', 'conv-1');
    await repository.appendMessage('conv-1', 'assistant', '__CHAT_PROPOSAL__:' + JSON.stringify(baseProposal));

    const reviser = {
      revise: jest.fn().mockResolvedValue({
        rawDescription: '10 kasik pilav',
        entries: [
          {
            ...baseProposal.entries[0]!,
            items: [{ name: 'Pilav', portionGrams: 280, calories: 370, proteinGrams: 7, carbsGrams: 77, fatGrams: 3 }],
            macros: { totalCalories: 370, totalProteinGrams: 7, totalCarbsGrams: 77, totalFatGrams: 3 },
          },
        ],
      }),
    };

    const recognizeFromText = new RecognizeFromText(makeEstimator(SUFFICIENT_RESULT));
    const tool = new ProposeMealLogTool(recognizeFromText, repository, reviser as never);

    const revised = await tool.execute(
      'user-1',
      { description: '10 kasik pilav yedim', mode: 'revise' },
      buildContext(),
    );

    expect(reviser.revise).toHaveBeenCalledWith(
      expect.objectContaining({
        rawDescription: 'pilav',
        entries: [
          expect.objectContaining({
            id: 'entry-1',
            userId: 'user-1',
            source: 'photo',
            createdAt: '2026-08-24T00:00:00.000Z',
          }),
        ],
      }),
      '10 kasik pilav yedim',
    );
    expect(revised.rawDescription).toBe('10 kasik pilav');
    expect(revised.entries[0]?.source).toBe('photo');
  });
});
