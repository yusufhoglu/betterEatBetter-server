import { deleteFinalObject } from '../../../shared/storage/presignedUrl';
import { CleanupOrphanedFoodEntriesJob } from './CleanupOrphanedFoodEntriesJob';

jest.mock('../../../shared/storage/presignedUrl', () => ({
  deleteFinalObject: jest.fn(),
}));

describe('CleanupOrphanedFoodEntriesJob', () => {
  const deleteFinalObjectMock = deleteFinalObject as jest.MockedFunction<typeof deleteFinalObject>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes orphaned completed food entries and skips already-logged ones', async () => {
    const foodEntryDelete = jest.fn().mockResolvedValue(undefined);
    const db = {
      foodEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'photo-orphan',
            userId: 'user-1',
            status: 'completed',
            createdAt: new Date('2026-08-20T10:00:00.000Z'),
          },
          {
            id: 'photo-logged',
            userId: 'user-1',
            status: 'completed',
            createdAt: new Date('2026-08-20T11:00:00.000Z'),
          },
        ]),
        delete: foodEntryDelete,
      },
      mealItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 'user-1',
            entries: [
              {
                id: 'photo-logged',
                source: 'photo',
                name: 'Chicken',
                portionGrams: 150,
                calories: 294,
                proteinG: 37.6,
                carbsG: 0.1,
                fatG: 16,
              },
            ],
          },
        ]),
      },
    };

    const job = new CleanupOrphanedFoodEntriesJob(db as never, 24, 100);
    const deletedCount = await job.execute(new Date('2026-08-24T12:00:00.000Z'));

    expect(deletedCount).toBe(1);
    expect(deleteFinalObjectMock).toHaveBeenCalledTimes(1);
    expect(deleteFinalObjectMock).toHaveBeenCalledWith('user-1', 'photo-orphan');
    expect(foodEntryDelete).toHaveBeenCalledTimes(1);
    expect(foodEntryDelete).toHaveBeenCalledWith({ where: { id: 'photo-orphan' } });
  });

  it('does not delete entries newer than the configured max age', async () => {
    const db = {
      foodEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn(),
      },
      mealItem: {
        findMany: jest.fn(),
      },
    };

    const job = new CleanupOrphanedFoodEntriesJob(db as never, 24, 100);
    const deletedCount = await job.execute(new Date('2026-08-24T12:00:00.000Z'));

    expect(deletedCount).toBe(0);
    expect(db.mealItem.findMany).not.toHaveBeenCalled();
    expect(deleteFinalObjectMock).not.toHaveBeenCalled();
  });
});
