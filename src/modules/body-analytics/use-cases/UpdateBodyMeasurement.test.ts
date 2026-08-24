import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { UpdateBodyMeasurement } from './UpdateBodyMeasurement';

describe('UpdateBodyMeasurement', () => {
  it('marks updated entries as edited', async () => {
    const repository = new InMemoryBodyMeasurementRepository();
    const created = await repository.create({
      userId: 'user-1',
      metric: 'weight',
      value: 80,
      unit: 'kg',
      date: new Date('2026-08-20T00:00:00.000Z'),
      source: 'manual',
    });
    const useCase = new UpdateBodyMeasurement(repository);

    const updated = await useCase.execute('user-1', created.id, { value: 79.5 });
    expect(updated.source).toBe('edited');
    expect(updated.value).toBe(79.5);
  });

  it('rejects a unit that does not match the existing metric', async () => {
    const repository = new InMemoryBodyMeasurementRepository();
    const created = await repository.create({
      userId: 'user-1',
      metric: 'weight',
      value: 80,
      unit: 'kg',
      date: new Date('2026-08-20T00:00:00.000Z'),
      source: 'manual',
    });
    const useCase = new UpdateBodyMeasurement(repository);

    await expect(useCase.execute('user-1', created.id, { unit: 'cm' })).rejects.toThrow(
      'unit must be kg for weight',
    );
  });
});
