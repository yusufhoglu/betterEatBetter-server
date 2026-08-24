import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { ListBodyMeasurements } from './ListBodyMeasurements';

describe('ListBodyMeasurements', () => {
  it('filters by user and optional metric', async () => {
    const repository = new InMemoryBodyMeasurementRepository([
      {
        id: '1',
        userId: 'user-1',
        metric: 'weight',
        value: 80,
        unit: 'kg',
        date: new Date('2026-08-24T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      },
      {
        id: '2',
        userId: 'user-1',
        metric: 'waist',
        value: 86,
        unit: 'cm',
        date: new Date('2026-08-23T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-23T00:00:00.000Z'),
      },
    ]);

    const useCase = new ListBodyMeasurements(repository);
    await expect(useCase.execute('user-1', { metric: 'weight' })).resolves.toEqual({
      items: [expect.objectContaining({ id: '1', metric: 'weight' })],
    });
  });
});
