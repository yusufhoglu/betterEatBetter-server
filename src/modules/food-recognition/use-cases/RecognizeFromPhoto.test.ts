import { RecognizeFromPhoto, recognizePhotoQueue, standardizeAndCopyQueue } from './RecognizeFromPhoto';
import { InMemoryFoodEntryRepository } from '../test-utils/fakes/InMemoryFoodEntryRepository';
import { ValidationError } from '../../../shared/errors/ValidationError';

// Mock the S3 client so we don't need real storage in unit tests
jest.mock('../../../shared/storage/objectStorageClient', () => ({
  OBJECT_STORAGE_BUCKET: 'test-bucket',
  objectStorageClient: {
    send: jest.fn(),
  },
}));

// Mock sharp so image validation works without native bindings
jest.mock('sharp', () => {
  return jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
  }));
});

// Mock queue add() — we test that the correct payload was enqueued
jest.mock('../../../shared/queue/queueConnection', () => ({
  createQueue: jest.fn(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-id' }),
  })),
  createWorker: jest.fn(),
}));

import { objectStorageClient } from '../../../shared/storage/objectStorageClient';

const mockSend = objectStorageClient.send as jest.Mock;

function makeValidHeadResponse(contentLength = 1024 * 1024): object {
  return { ContentLength: contentLength };
}

function makeValidGetResponse(bytes?: Buffer): object {
  const buffer = bytes ?? Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
  return {
    Body: (async function* () {
      yield buffer;
    })(),
  };
}

describe('RecognizeFromPhoto', () => {
  let repository: InMemoryFoodEntryRepository;
  let useCase: RecognizeFromPhoto;

  beforeEach(() => {
    repository = new InMemoryFoodEntryRepository();
    useCase = new RecognizeFromPhoto(repository);
    jest.clearAllMocks();

    // Default: HEAD returns valid size, GET returns JPEG magic bytes
    mockSend.mockImplementation((cmd: unknown) => {
      const cmdName = (cmd as { constructor: { name: string } }).constructor.name;
      if (cmdName === 'HeadObjectCommand') {
        return Promise.resolve(makeValidHeadResponse());
      }
      return Promise.resolve(makeValidGetResponse());
    });
  });

  it('enqueues both recognizePhoto and standardizeAndCopy jobs with mealPhotoId as jobId', async () => {
    const mealPhotoId = 'photo-abc-123';
    const userId = 'user-xyz';

    await useCase.execute({ mealPhotoId, userId });

    // Both queues should have received add() calls
    expect((recognizePhotoQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'recognize-photo',
      expect.objectContaining({ mealPhotoId, userId }),
      expect.objectContaining({ jobId: mealPhotoId }),
    );
    expect((standardizeAndCopyQueue.add as jest.Mock)).toHaveBeenCalledWith(
      'standardize-and-copy',
      expect.objectContaining({ mealPhotoId, userId }),
      expect.objectContaining({ jobId: mealPhotoId }),
    );
  });

  it('creates a food_entry with status=processing before enqueuing', async () => {
    const mealPhotoId = 'photo-abc-456';
    const userId = 'user-xyz';

    await useCase.execute({ mealPhotoId, userId });

    const entry = await repository.findById(mealPhotoId);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('processing');
    expect(entry!.userId).toBe(userId);
  });

  it('returns mealPhotoId in the output', async () => {
    const mealPhotoId = 'photo-return-test';
    const result = await useCase.execute({ mealPhotoId, userId: 'user-1' });
    expect(result.mealPhotoId).toBe(mealPhotoId);
  });

  it('throws PHOTO_NOT_FOUND ValidationError when object does not exist in storage', async () => {
    mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));

    await expect(useCase.execute({ mealPhotoId: 'missing', userId: 'user-1' })).rejects.toMatchObject({
      code: 'PHOTO_NOT_FOUND',
    });
  });

  it('throws PHOTO_TOO_LARGE ValidationError when file exceeds size limit', async () => {
    mockSend.mockImplementationOnce(() =>
      Promise.resolve({ ContentLength: 20 * 1024 * 1024 }), // 20MB
    );

    await expect(useCase.execute({ mealPhotoId: 'large-photo', userId: 'user-1' })).rejects.toMatchObject({
      code: 'PHOTO_TOO_LARGE',
    });
  });

  it('throws INVALID_IMAGE_FORMAT ValidationError when magic bytes are not image', async () => {
    mockSend.mockImplementation((cmd: unknown) => {
      const cmdName = (cmd as { constructor: { name: string } }).constructor.name;
      if (cmdName === 'HeadObjectCommand') {
        return Promise.resolve(makeValidHeadResponse());
      }
      // Return garbage bytes — not a valid image
      return Promise.resolve(makeValidGetResponse(Buffer.from([0x00, 0x00, 0x00, 0x00])));
    });

    await expect(
      useCase.execute({ mealPhotoId: 'bad-format', userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE_FORMAT' });
  });

  it('does NOT create a food_entry when validation fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));

    await expect(useCase.execute({ mealPhotoId: 'fail-photo', userId: 'user-1' })).rejects.toThrow(
      ValidationError,
    );
    expect(repository.findAll()).toHaveLength(0);
  });
});
