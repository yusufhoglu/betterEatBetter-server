import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { createWorker } from '../../../shared/queue/queueConnection';
import { createModuleLogger } from '../../../shared/observability/logger';
import { OBJECT_STORAGE_BUCKET, objectStorageClient } from '../../../shared/storage/objectStorageClient';
import { finalObjectExists, pendingObjectKey, finalObjectKey } from '../../../shared/storage/presignedUrl';
import { IntegrationError } from '../../../shared/errors/IntegrationError';
import type { StandardizeAndCopyJobPayload } from '../use-cases/RecognizeFromPhoto';

const logger = createModuleLogger('food-recognition');

const QUEUE_NAME = 'standardize-and-copy';
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;
const JPEG_QUALITY = 85;

function serializeStorageError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { err };
  }

  const candidate = err as Error & {
    name?: string;
    message?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number; requestId?: string; extendedRequestId?: string };
  };

  return {
    errorName: candidate.name,
    errorMessage: candidate.message,
    errorCode: candidate.Code ?? candidate.code,
    httpStatusCode: candidate.$metadata?.httpStatusCode,
    requestId: candidate.$metadata?.requestId,
    extendedRequestId: candidate.$metadata?.extendedRequestId,
  };
}

export async function standardizeImage(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    // Normalize EXIF orientation into the pixel buffer before any resize/re-encode.
    .rotate()
    .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * standardizeAndCopyJob:
 * 1. Downloads the pending photo
 * 2. Resize and re-compress with sharp (max 2048x2048, JPEG quality 85)
 * 3. COPY to final location (users/{userId}/meals/{mealPhotoId}.jpg)
 *    — The pending file is NOT deleted. It remains until R2 lifecycle rule
 *      removes it after 24h. This prevents the recognizePhotoJob from getting
 *      a 404 if it picks up the job before standardizeAndCopyJob completes.
 *
 * Trace context is set automatically by createWorker().
 */
export const standardizeAndCopyWorker = createWorker<StandardizeAndCopyJobPayload>(
  QUEUE_NAME,
  async (job) => {
    const { mealPhotoId, userId } = job.data;
    const sourceKey = pendingObjectKey(mealPhotoId);
    const destKey = finalObjectKey(userId, mealPhotoId);

    logger.info({ mealPhotoId, sourceKey, destKey }, 'starting standardize-and-copy');

    if (await finalObjectExists(userId, mealPhotoId)) {
      logger.info({ mealPhotoId, destKey }, 'standardize-and-copy skipped because final object already exists');
      return;
    }

    try {
      const head = await objectStorageClient.send(
        new HeadObjectCommand({ Bucket: OBJECT_STORAGE_BUCKET, Key: sourceKey }),
      );
      logger.info(
        {
          mealPhotoId,
          sourceKey,
          bucket: OBJECT_STORAGE_BUCKET,
          contentLength: head.ContentLength ?? 0,
          contentType: head.ContentType,
          eTag: head.ETag,
          lastModified: head.LastModified?.toISOString(),
        },
        'standardize-and-copy pending photo head-object succeeded',
      );
    } catch (err) {
      logger.error(
        { mealPhotoId, userId, sourceKey, bucket: OBJECT_STORAGE_BUCKET, ...serializeStorageError(err) },
        'standardize-and-copy pending photo head-object failed',
      );
      throw new IntegrationError('STORAGE_DOWNLOAD_ERROR', `Could not download pending photo: ${sourceKey}`, true);
    }

    // Download the pending photo
    let imageBuffer: Buffer;
    try {
      const obj = await objectStorageClient.send(
        new GetObjectCommand({ Bucket: OBJECT_STORAGE_BUCKET, Key: sourceKey }),
      );
      const chunks: Uint8Array[] = [];
      const stream = obj.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      imageBuffer = Buffer.concat(chunks);
      logger.info({ mealPhotoId, sourceKey, downloadedBytes: imageBuffer.length }, 'standardize-and-copy pending photo downloaded');
    } catch (err) {
      logger.error(
        { mealPhotoId, userId, sourceKey, bucket: OBJECT_STORAGE_BUCKET, ...serializeStorageError(err) },
        'standardize-and-copy pending photo download failed',
      );
      throw new IntegrationError('STORAGE_DOWNLOAD_ERROR', `Could not download pending photo: ${sourceKey}`, true);
    }

    // Resize and re-compress
    let processedBuffer: Buffer;
    try {
      processedBuffer = await standardizeImage(imageBuffer);
      logger.info(
        { mealPhotoId, sourceKey, originalBytes: imageBuffer.length, processedBytes: processedBuffer.length },
        'standardize-and-copy image standardized',
      );
    } catch (err) {
      logger.error({ mealPhotoId, sourceKey, err }, 'standardize-and-copy image processing failed');
      throw new IntegrationError('IMAGE_PROCESSING_ERROR', 'Failed to process image with sharp', false);
    }

    // COPY to final location (upload processed bytes as a new object)
    // We upload the processed bytes — not a S3 CopyObject — because we changed the content
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      if (await finalObjectExists(userId, mealPhotoId)) {
        logger.info({ mealPhotoId, destKey }, 'standardize-and-copy upload skipped because final object already exists');
        return;
      }

      await objectStorageClient.send(
        new PutObjectCommand({
          Bucket: OBJECT_STORAGE_BUCKET,
          Key: destKey,
          Body: processedBuffer,
          ContentType: 'image/jpeg',
        }),
      );
      logger.info(
        { mealPhotoId, destKey, bucket: OBJECT_STORAGE_BUCKET, uploadedBytes: processedBuffer.length },
        'standardize-and-copy final photo uploaded',
      );
    } catch (err) {
      logger.error(
        { mealPhotoId, userId, destKey, bucket: OBJECT_STORAGE_BUCKET, ...serializeStorageError(err) },
        'standardize-and-copy final photo upload failed',
      );
      throw new IntegrationError('STORAGE_UPLOAD_ERROR', `Could not upload processed photo to ${destKey}`, true);
    }

    // CRITICAL: Do NOT delete the pending file.
    // The recognizePhotoJob may still be waiting in the queue and needs the pending URL.
    // Deletion is handled by R2 lifecycle rule after 24h.

    logger.info({ mealPhotoId, destKey }, 'standardize-and-copy completed');
  },
);

standardizeAndCopyWorker.on('completed', (job) => {
  logger.info(
    {
      mealPhotoId: job.data.mealPhotoId,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
    },
    'standardize-and-copy job completed',
  );
});

standardizeAndCopyWorker.on('failed', (job, err) => {
  if (!job) {
    logger.error({ err }, 'standardize-and-copy job failed before BullMQ provided a job reference');
    return;
  }

  logger.error(
    {
      mealPhotoId: job.data.mealPhotoId,
      userId: job.data.userId,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      err,
    },
    'standardize-and-copy job permanently failed',
  );
});
