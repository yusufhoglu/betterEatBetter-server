import type { PhotoEstimateResult, PhotoEstimatorPort } from '../../ports/PhotoEstimatorPort';

/**
 * Fake photo estimator for unit tests.
 * Tracks call count for verifying circuit-breaker behavior.
 */
export class FakePhotoEstimator implements PhotoEstimatorPort {
  callCount = 0;

  constructor(private readonly result: PhotoEstimateResult | Error) {}

  async estimate(_photoUrl: string): Promise<PhotoEstimateResult> {
    this.callCount++;
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  }

  /** Factory: always returns a sufficient result. */
  static sufficient(): FakePhotoEstimator {
    return new FakePhotoEstimator({
      status: 'sufficient',
      items: [
        {
          name: 'Chicken Breast',
          portionGrams: 200,
          calories: 330,
          proteinGrams: 62,
          carbsGrams: 0,
          fatGrams: 7,
        },
      ],
      macros: {
        totalCalories: 330,
        totalProteinGrams: 62,
        totalCarbsGrams: 0,
        totalFatGrams: 7,
      },
      raw: {},
    });
  }

  /** Factory: always returns an insufficient_data result. */
  static insufficient(): FakePhotoEstimator {
    return new FakePhotoEstimator({
      status: 'insufficient_data',
      items: [],
      macros: { totalCalories: 0, totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0 },
      raw: {},
    });
  }

  /** Factory: always throws the given error. */
  static alwaysFails(error: Error): FakePhotoEstimator {
    return new FakePhotoEstimator(error);
  }
}
