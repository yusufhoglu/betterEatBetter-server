import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';
import type { LlmChatPort, LlmTurnResult } from '../../ports/LlmChatPort';

export class FakeLlmChatPort implements LlmChatPort {
  readonly sendTurnCalls: Array<{ messages: LlmMessage[]; tools?: LlmToolDefinition[] }> = [];
  readonly streamFinalReplyCalls: LlmMessage[][] = [];

  private turnResults: LlmTurnResult[] = [{ content: 'Hello!' }];
  private streamChunks: string[] = ['Hello', '!'];
  private streamError: Error | undefined;

  /** Queues the sequence of results returned by successive sendTurn() calls (last one repeats once exhausted). */
  setTurnResults(results: LlmTurnResult[]): void {
    this.turnResults = results;
  }

  setStreamChunks(chunks: string[]): void {
    this.streamChunks = chunks;
  }

  /** Makes streamFinalReply() throw partway through, after yielding streamChunks. */
  setStreamError(error: Error): void {
    this.streamError = error;
  }

  async sendTurn(messages: LlmMessage[], tools?: LlmToolDefinition[]): Promise<LlmTurnResult> {
    this.sendTurnCalls.push({ messages, tools });
    const index = Math.min(this.sendTurnCalls.length - 1, this.turnResults.length - 1);
    return this.turnResults[index]!;
  }

  async *streamFinalReply(messages: LlmMessage[]): AsyncIterable<string> {
    this.streamFinalReplyCalls.push(messages);
    for (const chunk of this.streamChunks) {
      yield chunk;
    }
    if (this.streamError) {
      throw this.streamError;
    }
  }
}
