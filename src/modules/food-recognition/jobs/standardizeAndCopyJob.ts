import { GetObjectCommand } from '@aws-sdk/client-s3';
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
    } catch (err) {
      throw new IntegrationError('STORAGE_DOWNLOAD_ERROR', `Could not download pending photo: ${sourceKey}`, true);
    }

    // Resize and re-compress
    let processedBuffer: Buffer;
    try {
      processedBuffer = await standardizeImage(imageBuffer);
    } catch (err) {
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
    } catch (err) {
      throw new IntegrationError('STORAGE_UPLOAD_ERROR', `Could not upload processed photo to ${destKey}`, true);
    }

    // CRITICAL: Do NOT delete the pending file.
    // The recognizePhotoJob may still be waiting in the queue and needs the pending URL.
    // Deletion is handled by R2 lifecycle rule after 24h.

    logger.info({ mealPhotoId, destKey }, 'standardize-and-copy completed');
  },
);
