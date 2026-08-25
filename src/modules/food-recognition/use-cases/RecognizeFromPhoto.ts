import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import { getTraceId } from '../../../shared/observability/tracer';
import { createQueue } from '../../../shared/queue/queueConnection';
import { env } from '../../../shared/config/env';
import { OBJECT_STORAGE_BUCKET, objectStorageClient } from '../../../shared/storage/objectStorageClient';
import { pendingObjectKey } from '../../../shared/storage/presignedUrl';
import type { FoodEntryRepositoryPort } from '../ports/FoodEntryRepositoryPort';
import type { BaseJobPayload } from '../../../shared/queue/jobTypes';

const logger = createModuleLogger('food-recognition');

const MAX_PHOTO_SIZE_BYTES = Number(process.env.MAX_PHOTO_SIZE_BYTES ?? 10 * 1024 * 1024);
const MAX_PHOTO_DIMENSION_PX = 8000;
const JOB_RETRY_ATTEMPTS = 3;
const JOB_RETRY_BACKOFF_MS = 5_000;

// Job queues — jobId = mealPhotoId (deterministic for idempotency)
export interface RecognizePhotoJobPayload extends BaseJobPayload {
  mealPhotoId: string;
  userId: string;
  photoObjectKey: string;
}

export interface StandardizeAndCopyJobPayload extends BaseJobPayload {
  mealPhotoId: string;
  userId: string;
}

export const recognizePhotoQueue = createQueue<RecognizePhotoJobPayload>('recognize-photo');
export const standardizeAndCopyQueue = createQueue<StandardizeAndCopyJobPayload>('standardize-and-copy');

/** Magic byte signatures for allowed image types. */
const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

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

function detectImageMime(buffer: Buffer): string | null {
  for (const sig of IMAGE_SIGNATURES) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) {
      // Extra check for WebP: bytes 8-11 must be 'WEBP'
      if (sig.mime === 'image/webp') {
        if (buffer.toString('ascii', 8, 12) !== 'WEBP') continue;
      }
      return sig.mime;
    }
  }
  return null;
}

export interface RecognizeFromPhotoInput {
  mealPhotoId: string;
  userId: string;
}

export interface RecognizeFromPhotoOutput {
  mealPhotoId: string;
}

/**
 * Async photo recognition flow:
 * 1. Validates the pending photo (size, magic bytes, resolution)
 * 2. Creates food_entry with status='processing'
 * 3. Enqueues both recognizePhotoJob and standardizeAndCopyJob in parallel
 * 4. Returns { mealPhotoId } — HTTP layer responds with 202
 */
export class RecognizeFromPhoto {
  constructor(private readonly repository: FoodEntryRepositoryPort) {}

  async execute(input: RecognizeFromPhotoInput): Promise<RecognizeFromPhotoOutput> {
    const { mealPhotoId, userId } = input;
    const objectKey = pendingObjectKey(mealPhotoId);
    logger.info({ mealPhotoId, userId, objectKey, bucket: OBJECT_STORAGE_BUCKET }, 'validating pending meal photo');

    // Step 1a: Check file size via HeadObject (no binary transfer)
    let contentLength: number;
    try {
      const head = await objectStorageClient.send(
        new HeadObjectCommand({ Bucket: OBJECT_STORAGE_BUCKET, Key: objectKey }),
      );
      contentLength = head.ContentLength ?? 0;
      logger.info(
        {
          mealPhotoId,
          objectKey,
          bucket: OBJECT_STORAGE_BUCKET,
          contentLength,
          contentType: head.ContentType,
          eTag: head.ETag,
          lastModified: head.LastModified?.toISOString(),
        },
        'pending meal photo head-object succeeded',
      );
    } catch (err) {
      logger.error(
        { mealPhotoId, userId, objectKey, bucket: OBJECT_STORAGE_BUCKET, ...serializeStorageError(err) },
        'pending meal photo head-object failed',
      );
      throw new ValidationError('PHOTO_NOT_FOUND', 'Photo not found in pending storage');
    }

    if (contentLength > MAX_PHOTO_SIZE_BYTES) {
      throw new ValidationError(
        'PHOTO_TOO_LARGE',
        `Photo exceeds maximum size of ${MAX_PHOTO_SIZE_BYTES} bytes`,
      );
    }

    // Step 1b + 1c: Download first 4KB for magic bytes + metadata for resolution
    // We use GetObject with Range to avoid downloading the full binary
    const firstBytes = await objectStorageClient.send(
      new GetObjectCommand({
        Bucket: OBJECT_STORAGE_BUCKET,
        Key: objectKey,
        Range: 'bytes=0-4095',
      }),
    );

    const chunks: Uint8Array[] = [];
    const stream = firstBytes.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const headerBuffer = Buffer.concat(chunks);

    const detectedMime = detectImageMime(headerBuffer);
    if (!detectedMime) {
      throw new ValidationError('INVALID_IMAGE_FORMAT', 'File is not a valid JPEG, PNG, or WebP image');
    }
    logger.info({ mealPhotoId, objectKey, detectedMime, headerBytesRead: headerBuffer.length }, 'pending meal photo header validated');

    // Resolution check: use sharp on the first bytes (enough for most headers)
    // Import sharp lazily to avoid issues in environments without native bindings during unit tests
    let imageWidth = 0;
    let imageHeight = 0;
    try {
      const sharp = (await import('sharp')).default;
      // Download the full image to check dimensions (needed for decompression bomb protection)
      const fullObj = await objectStorageClient.send(
        new GetObjectCommand({ Bucket: OBJECT_STORAGE_BUCKET, Key: objectKey }),
      );
      const fullChunks: Uint8Array[] = [];
      const fullStream = fullObj.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of fullStream) {
        fullChunks.push(chunk);
      }
      const metadata = await sharp(Buffer.concat(fullChunks)).metadata();
      imageWidth = metadata.width ?? 0;
      imageHeight = metadata.height ?? 0;
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('IMAGE_UNREADABLE', 'Could not read image metadata');
    }

    if (imageWidth > MAX_PHOTO_DIMENSION_PX || imageHeight > MAX_PHOTO_DIMENSION_PX) {
      throw new ValidationError(
        'IMAGE_TOO_LARGE',
        `Image dimensions exceed ${MAX_PHOTO_DIMENSION_PX}x${MAX_PHOTO_DIMENSION_PX} px`,
      );
    }
    logger.info({ mealPhotoId, objectKey, imageWidth, imageHeight }, 'pending meal photo dimensions validated');

    // Step 2: Persist with status='processing'
    await this.repository.create({ id: mealPhotoId, userId, status: 'processing' });
    logger.info({ mealPhotoId, userId }, 'food entry created with processing status');

    const traceId = getTraceId() ?? mealPhotoId;

    // Step 3: Enqueue both jobs in parallel — jobId = mealPhotoId (idempotent)
    await Promise.all([
      recognizePhotoQueue.add(
        'recognize-photo',
        { mealPhotoId, userId, photoObjectKey: objectKey, traceId },
        {
          jobId: mealPhotoId,
          attempts: JOB_RETRY_ATTEMPTS,
          backoff: {
            type: 'fixed',
            delay: JOB_RETRY_BACKOFF_MS,
          },
        },
      ),
      standardizeAndCopyQueue.add(
        'standardize-and-copy',
        { mealPhotoId, userId, traceId },
        {
          jobId: mealPhotoId,
          attempts: JOB_RETRY_ATTEMPTS,
          backoff: {
            type: 'fixed',
            delay: JOB_RETRY_BACKOFF_MS,
          },
        },
      ),
    ]);

    logger.info(
      {
        mealPhotoId,
        userId,
        objectKey,
        traceId,
        recognizeQueue: 'recognize-photo',
        standardizeQueue: 'standardize-and-copy',
      },
      'photo recognition jobs enqueued',
    );

    return { mealPhotoId };
  }
}
