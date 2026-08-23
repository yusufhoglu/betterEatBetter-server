import { CopyObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { OBJECT_STORAGE_BUCKET, objectStorageClient } from './objectStorageClient';

const PENDING_PREFIX = 'pending';
const PRESIGNED_PUT_TTL_SECONDS = 300;

/** Bucket lifecycle rule deletes this prefix after 24h — no manual cleanup job needed. */
export function pendingObjectKey(mealPhotoId: string): string {
  return `${PENDING_PREFIX}/${mealPhotoId}.jpg`;
}

/** Hierarchical so account-deletion can bulk-delete by prefix. */
export function finalObjectKey(userId: string, mealPhotoId: string): string {
  return `users/${userId}/meals/${mealPhotoId}.jpg`;
}

/** Mobile uploads the photo directly to R2 with this URL — Node never carries the binary. */
export function createPendingUploadUrl(mealPhotoId: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: OBJECT_STORAGE_BUCKET,
    Key: pendingObjectKey(mealPhotoId),
    ContentType: 'image/jpeg',
  });

  return getSignedUrl(objectStorageClient, command, { expiresIn: PRESIGNED_PUT_TTL_SECONDS });
}

/**
 * COPY, never MOVE: the analysis job may still be waiting in the queue when
 * this runs, and deleting the pending original would risk a 404 when it
 * finally picks the job up.
 */
export async function copyPendingToFinalLocation(userId: string, mealPhotoId: string): Promise<string> {
  const sourceKey = pendingObjectKey(mealPhotoId);
  const destinationKey = finalObjectKey(userId, mealPhotoId);

  await objectStorageClient.send(
    new CopyObjectCommand({
      Bucket: OBJECT_STORAGE_BUCKET,
      CopySource: `${OBJECT_STORAGE_BUCKET}/${sourceKey}`,
      Key: destinationKey,
    }),
  );

  return destinationKey;
}
