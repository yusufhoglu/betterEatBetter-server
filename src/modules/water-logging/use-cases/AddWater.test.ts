import { InMemoryWaterLogRepository } from '../test-utils/fakes/InMemoryWaterLogRepository';
import { AddWater } from './AddWater';

const today = new Date('2026-09-12T00:00:00.000Z');

describe('AddWater', () => {
  it('creates the day\'s total on the first add', async () => {
    const repository = new InMemoryWaterLogRepository();
    const useCase = new AddWater(repository);

    const result = await useCase.execute({ userId: 'user-1', date: today, amountMl: 200 });

    expect(result).toEqual({ date: today, amountMl: 200 });
  });

  it('accumulates across multiple adds for the same day', async () => {
    const repository = new InMemoryWaterLogRepository();
    const useCase = new AddWater(repository);

    await useCase.execute({ userId: 'user-1', date: today, amountMl: 200 });
    const result = await useCase.execute({ userId: 'user-1', date: today, amountMl: 300 });

    expect(result.amountMl).toBe(500);
  });

  it('keeps separate totals per user', async () => {
    const repository = new InMemoryWaterLogRepository();
    const useCase = new AddWater(repository);

    await useCase.execute({ userId: 'user-1', date: today, amountMl: 200 });
    const other = await useCase.execute({ userId: 'user-2', date: today, amountMl: 400 });

    expect(other.amountMl).toBe(400);
    expect((await repository.findByUserIdAndDate('user-1', today))?.amountMl).toBe(200);
  });
});
