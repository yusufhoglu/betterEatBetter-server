import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { OBJECT_STORAGE_BUCKET, objectStorageClient } from './objectStorageClient';

const PENDING_PREFIX = 'pending';
const PRESIGNED_PUT_TTL_SECONDS = 300;
const PRESIGNED_GET_TTL_SECONDS = 900;

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

/** RAG fetches the pending photo directly from R2 using a short-lived signed GET URL. */
export function createPendingDownloadUrl(mealPhotoId: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: OBJECT_STORAGE_BUCKET,
    Key: pendingObjectKey(mealPhotoId),
  });

  return getSignedUrl(objectStorageClient, command, { expiresIn: PRESIGNED_GET_TTL_SECONDS });
}

/** Mobile fetches the finalized logged photo from R2 with this short-lived signed GET URL. */
export function createFinalDownloadUrl(userId: string, mealPhotoId: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: OBJECT_STORAGE_BUCKET,
    Key: finalObjectKey(userId, mealPhotoId),
  });

  return getSignedUrl(objectStorageClient, command, { expiresIn: PRESIGNED_GET_TTL_SECONDS });
}

export async function finalObjectExists(userId: string, mealPhotoId: string): Promise<boolean> {
  try {
    await objectStorageClient.send(
      new HeadObjectCommand({
        Bucket: OBJECT_STORAGE_BUCKET,
        Key: finalObjectKey(userId, mealPhotoId),
      }),
    );
    return true;
  } catch {
    return false;
  }
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

/** Deletes the standardized final photo object if it still exists. */
export async function deleteFinalObject(userId: string, mealPhotoId: string): Promise<void> {
  await objectStorageClient.send(
    new DeleteObjectCommand({
      Bucket: OBJECT_STORAGE_BUCKET,
      Key: finalObjectKey(userId, mealPhotoId),
    }),
  );
}
