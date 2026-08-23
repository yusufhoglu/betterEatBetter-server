import express from 'express';
import request from 'supertest';
import { runWithContext } from '../../src/shared/observability/tracer';
import { InMemoryFoodEntryRepository } from '../../src/modules/food-recognition/test-utils/fakes/InMemoryFoodEntryRepository';
import { FakePhotoEstimator } from '../../src/modules/food-recognition/test-utils/fakes/FakePhotoEstimator';
import { ConfidencePolicy } from '../../src/modules/food-recognition/domain/policies/ConfidencePolicy';
import { errorMapperMiddleware } from '../../src/shared/errors/errorMapper';
import { authMiddleware } from '../../src/shared/auth/authMiddleware';
import { signAccessToken } from '../../src/shared/auth/jwt';

/**
 * E2E test: photo recognition full flow.
 *
 * Uses fake Python estimator (no real RAG service needed).
 * Flow: POST /food/photo → job enqueued → worker processes → food_entry updated.
 *
 * The job queue itself is stubbed at `shared/queue/queueConnection` (not at
 * RecognizeFromPhoto's own module exports) — RecognizeFromPhoto.ts calls
 * `createQueue()` internally, and mocking its own re-exported consts does not
 * rebind those same-module internal references, so the real BullMQ/Redis
 * connection would otherwise still be hit and hang every test.
 */

// Mock S3 client — no real storage needed for this E2E
jest.mock('../../src/shared/storage/objectStorageClient', () => ({
  OBJECT_STORAGE_BUCKET: 'test-bucket',
  objectStorageClient: {
    send: jest.fn(),
  },
}));

jest.mock('sharp', () => {
  return jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
  }));
});

// Stub the queue factory itself so RecognizeFromPhoto's internal createQueue()
// calls never touch a real Redis connection.
jest.mock('../../src/shared/queue/queueConnection', () => ({
  createQueue: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'test-job-id' }) })),
  createWorker: jest.fn(),
}));

import { objectStorageClient } from '../../src/shared/storage/objectStorageClient';
import {
  RecognizeFromPhoto,
  recognizePhotoQueue,
  standardizeAndCopyQueue,
} from '../../src/modules/food-recognition/use-cases/RecognizeFromPhoto';

const mockSend = objectStorageClient.send as jest.Mock;

describe('photo-recognition-flow (E2E)', () => {
  let repository: InMemoryFoodEntryRepository;
  let fakeEstimator: FakePhotoEstimator;
  let app: express.Express;
  let accessToken: string;

  const MEAL_PHOTO_ID = 'e2e-photo-test-001';
  const USER_ID = 'e2e-user-001';

  beforeEach(() => {
    jest.clearAllMocks();

    repository = new InMemoryFoodEntryRepository();
    fakeEstimator = FakePhotoEstimator.sufficient();

    // Mock S3: HEAD returns valid size, GET returns JPEG bytes
    mockSend.mockImplementation((cmd: unknown) => {
      const name = (cmd as { constructor: { name: string } }).constructor.name;
      if (name === 'HeadObjectCommand') {
        return Promise.resolve({ ContentLength: 512 * 1024 }); // 512KB
      }
      // JPEG magic bytes
      return Promise.resolve({
        Body: (async function* () {
          yield Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
        })(),
      });
    });

    const recognizeFromPhoto = new RecognizeFromPhoto(repository);

    // Express app with minimal wiring for E2E
    app = express();
    app.use(express.json());

    // Simple trace middleware
    app.use((req, _res, next) => {
      const traceId = req.header('x-trace-id') ?? 'e2e-trace-id';
      runWithContext({ traceId }, () => next());
    });

    app.post('/food/photo', authMiddleware, async (req, res, next) => {
      try {
        const userId = req.auth!.userId;
        const { mealPhotoId } = req.body;
        if (!mealPhotoId) {
          res.status(400).json({ code: 'INVALID_BODY' });
          return;
        }
        const result = await recognizeFromPhoto.execute({ mealPhotoId, userId });
        res.status(202).json(result);
      } catch (err) {
        next(err);
      }
    });

    app.get('/food/photo/:mealPhotoId', async (req, res) => {
      const entry = await repository.findById(req.params.mealPhotoId);
      if (!entry) { res.status(404).json({ code: 'NOT_FOUND' }); return; }
      res.json(entry);
    });

    app.use(errorMapperMiddleware);

    // Issue a real JWT for the test user
    accessToken = signAccessToken(USER_ID);
  });

  it('POST /food/photo returns 202 with mealPhotoId', async () => {
    const resp = await request(app)
      .post('/food/photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mealPhotoId: MEAL_PHOTO_ID });

    expect(resp.status).toBe(202);
    expect(resp.body.mealPhotoId).toBe(MEAL_PHOTO_ID);
  });

  it('creates a food_entry with status=processing after POST /food/photo', async () => {
    await request(app)
      .post('/food/photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mealPhotoId: MEAL_PHOTO_ID });

    const entry = await repository.findById(MEAL_PHOTO_ID);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('processing');
    expect(entry!.userId).toBe(USER_ID);
  });

  it('both recognize and standardize jobs are enqueued with jobId=mealPhotoId', async () => {
    await request(app)
      .post('/food/photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mealPhotoId: MEAL_PHOTO_ID });

    expect((recognizePhotoQueue.add as jest.Mock)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mealPhotoId: MEAL_PHOTO_ID }),
      expect.objectContaining({ jobId: MEAL_PHOTO_ID }),
    );
    expect((standardizeAndCopyQueue.add as jest.Mock)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mealPhotoId: MEAL_PHOTO_ID }),
      expect.objectContaining({ jobId: MEAL_PHOTO_ID }),
    );
  });

  it('simulates job completion: food_entry transitions from processing to completed', async () => {
    // Step 1: POST /food/photo
    await request(app)
      .post('/food/photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mealPhotoId: MEAL_PHOTO_ID });

    let entry = await repository.findById(MEAL_PHOTO_ID);
    expect(entry!.status).toBe('processing');

    // Step 2: Simulate what the recognizePhotoJob worker does after it runs
    const fakeResult = await fakeEstimator.estimate('https://example.com/pending.jpg');
    const needsUserAction = ConfidencePolicy.needsUserAction(fakeResult.status);
    await repository.updateResult(MEAL_PHOTO_ID, {
      status: needsUserAction ? 'insufficient_data' : 'completed',
      items: fakeResult.items,
      macros: fakeResult.macros,
      needsUserAction,
      resultJson: fakeResult.raw,
    });

    // Step 3: GET /food/photo/:mealPhotoId (polling)
    const resp = await request(app).get(`/food/photo/${MEAL_PHOTO_ID}`);
    expect(resp.status).toBe(200);
    expect(resp.body.status).toBe('completed');
    expect(resp.body.needsUserAction).toBe(false);
    expect(resp.body.items.length).toBeGreaterThan(0);
  });

  it('returns 401 when called without auth token', async () => {
    const resp = await request(app)
      .post('/food/photo')
      .send({ mealPhotoId: MEAL_PHOTO_ID });

    expect(resp.status).toBe(401);
  });

  it('returns 400 when mealPhotoId is missing', async () => {
    const resp = await request(app)
      .post('/food/photo')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(resp.status).toBe(400);
  });
});
