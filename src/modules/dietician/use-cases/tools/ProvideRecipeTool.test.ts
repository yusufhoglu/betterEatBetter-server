import type { LlmClient } from '../../../../shared/llm/LlmClient';
import type {
  LlmCompleteRequest,
  LlmCompleteResponse,
  LlmStreamCompleteRequest,
} from '../../../../shared/llm/types';
import { ProvideRecipeTool } from './ProvideRecipeTool';

class FakeLlmClient implements LlmClient {
  readonly completeRequests: LlmCompleteRequest[] = [];
  structuredResult: Record<string, unknown> = {
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

function buildTool() {
  const llmClient = new FakeLlmClient();
  const tool = new ProvideRecipeTool(llmClient, 'cheap-model');
  return { tool, llmClient };
}

describe('ProvideRecipeTool', () => {
  it('returns the structured recipe from the cheap model', async () => {
    const { tool } = buildTool();

    const recipe = await tool.execute(
      'user-1',
      { request: 'high protein dinner' },
      { conversationId: 'c1', messages: [] },
    );

    expect(recipe).toEqual({
      title: 'High-protein chicken bowl',
      timeMinutes: 20,
      servings: 1,
      calories: 550,
      proteinGrams: 45,
      carbsGrams: 40,
      fatGrams: 18,
      ingredients: [{ name: 'chicken breast', amount: '150g' }],
      steps: ['Grill the chicken.', 'Serve over rice with vegetables.'],
    });
  });

  it('includes targetCalories in the user message when provided', async () => {
    const { tool, llmClient } = buildTool();

    await tool.execute(
      'user-1',
      { request: 'lighter version', targetCalories: 480 },
      { conversationId: 'c1', messages: [] },
    );

    const request = llmClient.completeRequests[0]!;
    const userMessage = request.messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Target calories: 480');
  });

  it('throws for an empty request', async () => {
    const { tool } = buildTool();
    await expect(tool.execute('user-1', {}, { conversationId: 'c1', messages: [] })).rejects.toThrow();
  });

  it('exposes a provide_recipe tool definition', () => {
    const { tool } = buildTool();
    expect(tool.definition.name).toBe('provide_recipe');
    expect(tool.yieldsCard).toBe('recipe');
  });
});
