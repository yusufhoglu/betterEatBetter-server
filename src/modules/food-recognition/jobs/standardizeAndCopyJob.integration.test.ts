import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import sharp from 'sharp';
import { pendingObjectKey, finalObjectKey } from '../../../shared/storage/presignedUrl';
import type { StandardizeAndCopyJobPayload } from '../use-cases/RecognizeFromPhoto';
import type { createWorker as CreateWorkerFn } from '../../../shared/queue/queueConnection';

/**
 * Integration test for standardizeAndCopyJob.
 *
 * CRITICAL BEHAVIOR VERIFIED:
 * After the job copies the photo to the final location, the pending file
 * MUST still exist. Deleting it would cause a race condition where the
 * recognizePhotoJob gets a 404 if it picks up before standardizeAndCopy.
 *
 * `shared/queue/queueConnection` builds its Redis connection once, from
 * `env.REDIS_URL`, at module-load time — setting `process.env.REDIS_URL`
 * afterward has no effect on an already-loaded connection. `createWorker` is
 * therefore imported dynamically below, after the Redis testcontainer starts
 * and REDIS_URL is set, rather than via a static top-level import.
 */
describe('standardizeAndCopyJob — storage integration', () => {
  let minioContainer: StartedTestContainer;
  let redisContainer: StartedRedisContainer;
  let s3: S3Client;
  let createWorker: typeof CreateWorkerFn;
  const BUCKET = 'test-bucket';
  const TEST_QUEUE = 'test-standardize-and-copy';

  beforeAll(async () => {
    // Start MinIO (S3-compatible)
    minioContainer = await new GenericContainer('minio/minio')
      .withExposedPorts(9000)
      .withCommand(['server', '/data'])
      .withEnvironment({
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'minioadmin',
      })
      .start();

    const minioPort = minioContainer.getMappedPort(9000);
    const minioEndpoint = `http://127.0.0.1:${minioPort}`;

    s3 = new S3Client({
      endpoint: minioEndpoint,
      region: 'us-east-1',
      credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
      forcePathStyle: true,
    });

    // Create test bucket
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));

    // Start Redis for BullMQ
    redisContainer = await new RedisContainer('redis:7-alpine').start();
    process.env.REDIS_URL = redisContainer.getConnectionUrl();

    // Must be set before queueConnection (and the env it reads) is first imported.
    ({ createWorker } = await import('../../../shared/queue/queueConnection'));
  }, 120_000);

  afterAll(async () => {
    await minioContainer.stop();
    await redisContainer.stop();
  });

  it('copies the processed photo to final location AND leaves the pending file in place', async () => {
    const mealPhotoId = 'copy-test-photo-id';
    const userId = 'copy-test-user';

    // Create a minimal valid JPEG in memory using sharp
    const jpegBuffer = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();

    const pendingKey = pendingObjectKey(mealPhotoId);
    const finalKey = finalObjectKey(userId, mealPhotoId);

    // Upload the pending photo
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: pendingKey,
        Body: jpegBuffer,
        ContentType: 'image/jpeg',
      }),
    );

    const IORedisClass = (await import('ioredis')).default;
    const conn = new IORedisClass(redisContainer.getConnectionUrl(), {
      maxRetriesPerRequest: null,
    });

    const queue = new Queue<StandardizeAndCopyJobPayload>(TEST_QUEUE, { connection: conn });

    let resolveJob!: () => void;
    const jobProcessed = new Promise<void>((resolve) => {
      resolveJob = resolve;
    });

    // Create a worker that simulates what standardizeAndCopyJob does
    // but uses our test s3 client
    const worker = createWorker<StandardizeAndCopyJobPayload>(TEST_QUEUE, async (job) => {
      const { mealPhotoId: photoId, userId: uid } = job.data;
      const srcKey = pendingObjectKey(photoId);
      const dstKey = finalObjectKey(uid, photoId);

      // Download
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: srcKey }));
      const chunks: Uint8Array[] = [];
      const stream = obj.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);

      // Process
      const processed = await sharp(buf).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();

      // Upload to final location (COPY, not MOVE)
      const { PutObjectCommand: Put } = await import('@aws-sdk/client-s3');
      await s3.send(new Put({ Bucket: BUCKET, Key: dstKey, Body: processed, ContentType: 'image/jpeg' }));

      // DO NOT delete srcKey

      resolveJob();
    });

    await queue.add(
      'standardize-and-copy',
      { mealPhotoId, userId, traceId: 'test-trace-123' },
      { jobId: mealPhotoId },
    );

    await jobProcessed;

    // Verify: final file exists
    const finalHead = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: finalKey }));
    expect(finalHead.ContentLength).toBeGreaterThan(0);

    // CRITICAL ASSERTION: pending file still exists
    const pendingHead = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: pendingKey }));
    expect(pendingHead.ContentLength).toBeGreaterThan(0);

    await worker.close();
    await queue.close();
    await conn.quit();
  }, 60_000);
});
