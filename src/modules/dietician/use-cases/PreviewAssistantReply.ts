import type { LlmMessage } from '../../../shared/llm/types';
import { ASSISTANT_PREVIEW_NOTE, assistantRulesReminder } from '../domain/assistantPersonaBlock';
import type { DietitianPersona } from '../ports/CoachAccessPort';
import type { LlmDieticianPort } from '../ports/LlmDieticianPort';

/**
 * Public for the `practice` module: a dietitian tries their assistant. Stores
 * nothing. Same system prompt and rules reminder their clients' chats get, so
 * what the preview does is what clients see (minus client data and tools).
 */
export class PreviewAssistantReply {
  constructor(private readonly llm: LlmDieticianPort) {}

  execute(persona: DietitianPersona, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    const prompt: LlmMessage[] = [
      { role: 'system', content: ASSISTANT_PREVIEW_NOTE },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: 'system', content: assistantRulesReminder(persona) },
    ];
    return this.llm.previewReply(prompt, persona);
  }
}
