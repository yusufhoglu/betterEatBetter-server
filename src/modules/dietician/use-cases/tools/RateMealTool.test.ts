import type { LlmClient } from '../../../../shared/llm/LlmClient';
import type {
  LlmCompleteRequest,
  LlmCompleteResponse,
  LlmStreamCompleteRequest,
} from '../../../../shared/llm/types';
import { RecognizeFromText } from '../../../food-recognition/use-cases/RecognizeFromText';
import type { TextEstimateResult, TextEstimatorPort } from '../../../food-recognition/ports/TextEstimatorPort';
import { RateMealTool } from './RateMealTool';

class FakeTextEstimatorPort implements TextEstimatorPort {
  constructor(private readonly result: TextEstimateResult) {}
  async estimate(): Promise<TextEstimateResult> {
    return this.result;
  }
}

class FakeLlmClient implements LlmClient {
  readonly completeRequests: LlmCompleteRequest[] = [];
  structuredResult: Record<string, unknown> = {
    score: 6.5,
    flaggedMacro: 'carbs',
    goodNote: 'Good protein for the portion.',
    fixNote: 'Swap the white bread for whole grain.',
  };

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    this.completeRequests.push(request);
    return {
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: request.forceToolChoice!.toolName, input: this.structuredResult }],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }

  async *streamComplete(_request: LlmStreamCompleteRequest): AsyncIterable<string> {
    yield 'unused';
  }
}

function buildTool(estimate: TextEstimateResult) {
  const recognizeFromText = new RecognizeFromText(new FakeTextEstimatorPort(estimate));
  const llmClient = new FakeLlmClient();
  const tool = new RateMealTool(recognizeFromText, llmClient, 'cheap-model');
  return { tool, llmClient };
}

const SUFFICIENT_ESTIMATE: TextEstimateResult = {
  status: 'sufficient',
  items: [{ name: 'Sandwich', portionGrams: 220, calories: 450, proteinGrams: 30, carbsGrams: 40, fatGrams: 15 }],
  macros: { totalCalories: 450, totalProteinGrams: 30, totalCarbsGrams: 40, totalFatGrams: 15 },
};

describe('RateMealTool', () => {
  it('combines macros from the real RecognizeFromText use-case with the LLM score into a MealRating', async () => {
    const { tool } = buildTool(SUFFICIENT_ESTIMATE);

    const rating = await tool.execute(
      'user-1',
      { description: 'chicken sandwich' },
      { conversationId: 'c1', messages: [] },
    );

    expect(rating).toEqual({
      mealName: 'chicken sandwich',
      score: 6.5,
      macros: { totalCalories: 450, totalProteinGrams: 30, totalCarbsGrams: 40, totalFatGrams: 15 },
      flaggedMacro: 'carbs',
      goodNote: 'Good protein for the portion.',
      fixNote: 'Swap the white bread for whole grain.',
    });
  });

  it('forwards only the system messages from context as plan grounding for the scoring call', async () => {
    const { tool, llmClient } = buildTool(SUFFICIENT_ESTIMATE);

    await tool.execute(
      'user-1',
      { description: 'chicken sandwich' },
      {
        conversationId: 'c1',
        messages: [
          { role: 'system', content: 'User plan: ...' },
          { role: 'user', content: 'rate my lunch' },
        ],
      },
    );

    const request = llmClient.completeRequests[0]!;
    expect(request.messages.filter((m) => m.role === 'system')).toEqual([{ role: 'system', content: 'User plan: ...' }]);
    expect(request.messages.some((m) => m.role === 'user')).toBe(true);
  });

  it('throws for an empty description', async () => {
    const { tool } = buildTool(SUFFICIENT_ESTIMATE);
    await expect(tool.execute('user-1', {}, { conversationId: 'c1', messages: [] })).rejects.toThrow();
  });

  it('exposes a rate_meal tool definition', () => {
    const { tool } = buildTool(SUFFICIENT_ESTIMATE);
    expect(tool.definition.name).toBe('rate_meal');
    expect(tool.yieldsCard).toBe('rating');
  });
});
