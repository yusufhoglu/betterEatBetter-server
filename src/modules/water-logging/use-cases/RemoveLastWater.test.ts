import { InMemoryWaterLogRepository } from '../test-utils/fakes/InMemoryWaterLogRepository';
import { AddWater } from './AddWater';
import { RemoveLastWater } from './RemoveLastWater';

const today = new Date('2026-09-12T00:00:00.000Z');

describe('RemoveLastWater', () => {
  it('steps the total back down by one increment', async () => {
    const repository = new InMemoryWaterLogRepository();
    await new AddWater(repository).execute({ userId: 'user-1', date: today, amountMl: 600 });
    const useCase = new RemoveLastWater(repository);

    const result = await useCase.execute({ userId: 'user-1', date: today });

    expect(result.amountMl).toBe(400);
  });

  it('leaves a sub-increment total untouched rather than clamping to 0', async () => {
    const repository = new InMemoryWaterLogRepository();
    await new AddWater(repository).execute({ userId: 'user-1', date: today, amountMl: 150 });
    const useCase = new RemoveLastWater(repository);

    const result = await useCase.execute({ userId: 'user-1', date: today });

    expect(result.amountMl).toBe(150);
  });

  it('is a no-op with nothing logged yet', async () => {
    const repository = new InMemoryWaterLogRepository();
    const useCase = new RemoveLastWater(repository);

    const result = await useCase.execute({ userId: 'user-1', date: today });

    expect(result.amountMl).toBe(0);
  });
});
