import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { OBJECT_STORAGE_BUCKET, objectStorageClient } from '../../../../shared/storage/objectStorageClient';
import type { ChatAttachmentStoragePort } from '../../ports/ChatAttachmentStoragePort';

const PUT_TTL_SECONDS = 300;
const GET_TTL_SECONDS = 900;

/**
 * Keys live under users/{userId}/chat/… — so account deletion's prefix sweep
 * covers chat images too. Uploaded straight to the final key (no pending/
 * copy step: nothing analyses these images).
 */
export class R2ChatAttachmentStorage implements ChatAttachmentStoragePort {
  createUploadUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      objectStorageClient,
      new PutObjectCommand({ Bucket: OBJECT_STORAGE_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: PUT_TTL_SECONDS },
    );
  }

  createDownloadUrl(key: string): Promise<string> {
    return getSignedUrl(objectStorageClient, new GetObjectCommand({ Bucket: OBJECT_STORAGE_BUCKET, Key: key }), {
      expiresIn: GET_TTL_SECONDS,
    });
  }
}
