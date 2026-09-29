import type { LlmMessage } from '../../../shared/llm/types';
import { ASSISTANT_PREVIEW_NOTE, buildAssistantPersonaBlock } from '../domain/assistantPersonaBlock';
import type { DietitianPersona } from '../ports/CoachAccessPort';
import type { LlmDieticianPort } from '../ports/LlmDieticianPort';

/** Public for the `practice` module: a dietitian tries their assistant. Stores nothing. */
export class PreviewAssistantReply {
  constructor(private readonly llm: LlmDieticianPort) {}

  execute(persona: DietitianPersona, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    const prompt: LlmMessage[] = [
      { role: 'system', content: buildAssistantPersonaBlock(persona) },
      { role: 'system', content: ASSISTANT_PREVIEW_NOTE },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ];
    return this.llm.previewReply(prompt);
  }
}
