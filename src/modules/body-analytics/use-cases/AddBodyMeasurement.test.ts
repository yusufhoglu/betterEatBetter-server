import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { AddBodyMeasurement } from './AddBodyMeasurement';

describe('AddBodyMeasurement', () => {
  it('creates a manual measurement with the validated metric unit', async () => {
    const repository = new InMemoryBodyMeasurementRepository();
    const useCase = new AddBodyMeasurement(repository);

    const created = await useCase.execute('user-1', {
      metric: 'weight',
      value: 72.4,
      unit: 'kg',
      date: new Date('2026-08-24T00:00:00.000Z'),
    });

    expect(created).toMatchObject({
      userId: 'user-1',
      metric: 'weight',
      value: 72.4,
      unit: 'kg',
      source: 'manual',
    });
  });
});
