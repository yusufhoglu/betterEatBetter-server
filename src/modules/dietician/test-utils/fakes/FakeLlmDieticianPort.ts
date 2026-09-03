import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';
import type { ConversationDigest } from '../../domain/ConversationDigest';
import type { DieticianIntent } from '../../domain/DieticianIntent';
import type {
  DieticianTurnResult,
  LlmDieticianPort,
  SummarizeConversationInput,
} from '../../ports/LlmDieticianPort';

const DEFAULT_DIGEST: ConversationDigest = {
  goalsRecap: 'lose weight, ~1800 kcal',
  adviceGivenRecap: 'suggested higher-protein breakfasts',
  openThreads: 'user will try oats tomorrow',
  learnedPreferences: 'dislikes fish',
};

/** Scriptable fake for the tiered LLM seam. */
export class FakeLlmDieticianPort implements LlmDieticianPort {
  readonly classifyCalls: Array<{ message: string; recentMessages: LlmMessage[] }> = [];
  readonly gatherCalls: Array<{ messages: LlmMessage[]; tools: LlmToolDefinition[] }> = [];
  readonly adviceCalls: LlmMessage[][] = [];
  readonly smalltalkCalls: LlmMessage[][] = [];
  readonly summarizeCalls: SummarizeConversationInput[] = [];

  private intent: DieticianIntent = 'advice';
  private gatherResults: DieticianTurnResult[] = [{ content: '' }];
  private adviceChunks: string[] = ['Here is my advice.'];
  private smalltalkChunks: string[] = ['Hi! Ask me about your plan.'];
  private streamError: Error | undefined;
  private digest: ConversationDigest = DEFAULT_DIGEST;
  private summarizeError: Error | undefined;

  setIntent(intent: DieticianIntent): void {
    this.intent = intent;
  }

  /** Sequence returned by successive runContextGathering calls (last repeats). */
  setGatherResults(results: DieticianTurnResult[]): void {
    this.gatherResults = results;
  }

  setAdviceChunks(chunks: string[]): void {
    this.adviceChunks = chunks;
  }

  setSmalltalkChunks(chunks: string[]): void {
    this.smalltalkChunks = chunks;
  }

  setStreamError(error: Error): void {
    this.streamError = error;
  }

  setDigest(digest: ConversationDigest): void {
    this.digest = digest;
  }

  setSummarizeError(error: Error): void {
    this.summarizeError = error;
  }

  async classifyIntent(input: { message: string; recentMessages: LlmMessage[] }): Promise<DieticianIntent> {
    this.classifyCalls.push(input);
    return this.intent;
  }

  async runContextGathering(messages: LlmMessage[], tools: LlmToolDefinition[]): Promise<DieticianTurnResult> {
    this.gatherCalls.push({ messages, tools });
    const index = Math.min(this.gatherCalls.length - 1, this.gatherResults.length - 1);
    return this.gatherResults[index]!;
  }

  async *streamAdvice(messages: LlmMessage[]): AsyncIterable<string> {
    this.adviceCalls.push(messages);
    yield* this.emit(this.adviceChunks);
  }

  async *streamSmalltalk(messages: LlmMessage[]): AsyncIterable<string> {
    this.smalltalkCalls.push(messages);
    yield* this.emit(this.smalltalkChunks);
  }

  async summarizeConversation(input: SummarizeConversationInput): Promise<ConversationDigest> {
    this.summarizeCalls.push(input);
    if (this.summarizeError) {
      throw this.summarizeError;
    }
    return this.digest;
  }

  private async *emit(chunks: string[]): AsyncIterable<string> {
    for (const chunk of chunks) {
      yield chunk;
    }
    if (this.streamError) {
      throw this.streamError;
    }
  }
}
