import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { DeleteBodyMeasurement } from './DeleteBodyMeasurement';

describe('DeleteBodyMeasurement', () => {
  it('removes the measurement', async () => {
    const repository = new InMemoryBodyMeasurementRepository();
    const measurement = await repository.create({
      userId: 'user-1',
      metric: 'weight',
      value: 80,
      unit: 'kg',
      date: new Date('2026-08-20T00:00:00.000Z'),
      source: 'manual',
    });
    const useCase = new DeleteBodyMeasurement(repository);

    await useCase.execute('user-1', measurement.id);
    await expect(repository.findById('user-1', measurement.id)).resolves.toBeNull();
  });
});
