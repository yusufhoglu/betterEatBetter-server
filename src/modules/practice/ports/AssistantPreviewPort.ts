import type { AssistantPersona } from '../domain/aiAssistant';

export interface PreviewMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Lets a dietitian try their assistant before opening it to clients. Backed by
 * the `dietician` module's prompt + model — no client data, no tools.
 */
export interface AssistantPreviewPort {
  reply(persona: AssistantPersona, messages: PreviewMessage[]): Promise<string>;
}
