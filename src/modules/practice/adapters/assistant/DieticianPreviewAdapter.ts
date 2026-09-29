import type { PreviewAssistantReply } from '../../../dietician/use-cases/PreviewAssistantReply';
import type { AssistantPersona } from '../../domain/aiAssistant';
import type { AssistantPreviewPort, PreviewMessage } from '../../ports/AssistantPreviewPort';

export class DieticianPreviewAdapter implements AssistantPreviewPort {
  constructor(private readonly previewAssistantReply: PreviewAssistantReply) {}

  reply(persona: AssistantPersona, messages: PreviewMessage[]): Promise<string> {
    return this.previewAssistantReply.execute(persona, messages);
  }
}
