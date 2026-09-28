import type { ChatMessage } from '../domain/messagingTypes';
import type { ChatAttachmentStoragePort } from '../ports/ChatAttachmentStoragePort';

export interface MessageView {
  id: string;
  threadId: string;
  senderId: string | null;
  clientMessageId: string;
  type: ChatMessage['type'];
  body: string | null;
  attachments: Array<{ kind: 'image'; url: string; contentType: string; width?: number; height?: number }>;
  createdAt: string;
}

/** Wire form: attachment keys become short-lived signed URLs. */
export async function presentMessage(message: ChatMessage, storage: ChatAttachmentStoragePort): Promise<MessageView> {
  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    type: message.type,
    body: message.body,
    attachments: await Promise.all(
      message.attachments.map(async ({ key, ...rest }) => ({ ...rest, url: await storage.createDownloadUrl(key) })),
    ),
    createdAt: message.createdAt.toISOString(),
  };
}
