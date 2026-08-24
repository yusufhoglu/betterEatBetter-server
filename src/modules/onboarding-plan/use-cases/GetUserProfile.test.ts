import { InMemoryUserProfileRepository } from '../test-utils/fakes/InMemoryUserProfileRepository';
import { GetUserProfile } from './GetUserProfile';

describe('GetUserProfile', () => {
  test('returns the full user profile when one exists', async () => {
    const userProfileRepository = new InMemoryUserProfileRepository();
    await userProfileRepository.create({
      userId: 'user-1',
      weightKg: 80,
      targetWeightKg: 72,
      initialWeightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'male',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });

    const getUserProfile = new GetUserProfile(userProfileRepository);

    await expect(getUserProfile.execute('user-1')).resolves.toMatchObject({
      userId: 'user-1',
      weightKg: 80,
      targetWeightKg: 72,
      initialWeightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'male',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });
  });

  test('returns null when the profile does not exist', async () => {
    const getUserProfile = new GetUserProfile(new InMemoryUserProfileRepository());

    await expect(getUserProfile.execute('missing-user')).resolves.toBeNull();
  });
});
