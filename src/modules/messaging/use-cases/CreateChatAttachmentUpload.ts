import { randomUUID } from 'node:crypto';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { chatAttachmentPrefix } from '../domain/messagingTypes';
import type { ChatAttachmentStoragePort } from '../ports/ChatAttachmentStoragePort';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';
import { requireParticipant } from './requireParticipant';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/**
 * Direct-to-R2 upload (Node never carries the binary): returns a presigned
 * PUT URL plus the key to send back in the image message.
 */
export class CreateChatAttachmentUpload {
  constructor(
    private readonly repository: ThreadRepositoryPort,
    private readonly storage: ChatAttachmentStoragePort,
  ) {}

  async execute(userId: string, threadId: string, contentType: string): Promise<{ key: string; uploadUrl: string; contentType: string }> {
    const extension = EXTENSIONS[contentType];
    if (!extension) {
      throw new ValidationError('UNSUPPORTED_CONTENT_TYPE', 'Only JPEG, PNG, WebP and HEIC images are supported');
    }
    const { thread } = await requireParticipant(this.repository, threadId, userId);
    if (thread.readOnly) {
      throw new ForbiddenError('THREAD_READ_ONLY', 'This conversation has ended');
    }

    const key = `${chatAttachmentPrefix(userId)}${threadId}/${randomUUID()}.${extension}`;
    return { key, contentType, uploadUrl: await this.storage.createUploadUrl(key, contentType) };
  }
}
