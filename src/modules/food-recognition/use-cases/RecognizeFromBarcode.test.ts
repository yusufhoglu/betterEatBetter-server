import { RecognizeFromBarcode } from './RecognizeFromBarcode';
import { FakeBarcodeCache } from '../test-utils/fakes/FakeBarcodeCache';
import { FakeBarcodeLookup } from '../test-utils/fakes/FakeBarcodeLookup';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { BarcodeProduct } from '../ports/BarcodeLookupPort';

const TEST_PRODUCT: BarcodeProduct = {
  barcode: '1234567890',
  name: 'Greek Yogurt',
  items: [
    {
      name: 'Greek Yogurt',
      portionGrams: 100,
      calories: 59,
      proteinGrams: 10,
      carbsGrams: 4,
      fatGrams: 0.4,
    },
  ],
  macros: {
    totalCalories: 59,
    totalProteinGrams: 10,
    totalCarbsGrams: 4,
    totalFatGrams: 0.4,
  },
};

describe('RecognizeFromBarcode', () => {
  describe('cache hit scenario', () => {
    it('returns product data without calling external lookup when cache has a positive entry', async () => {
      const cache = new FakeBarcodeCache();
      const lookup = FakeBarcodeLookup.empty();
      await cache.setFound(TEST_PRODUCT.barcode, TEST_PRODUCT);

      const useCase = new RecognizeFromBarcode(cache, lookup);
      const result = await useCase.execute({ barcode: TEST_PRODUCT.barcode, userId: 'user-1' });

      expect(result.items).toEqual(TEST_PRODUCT.items);
      expect(result.source).toBe('barcode');
      expect(result.needsUserAction).toBe(false);
      // External lookup was never reached
      expect(lookup.callCount).toBe(0);
    });
  });

  describe('cache miss scenario', () => {
    it('calls external lookup when cache returns null, then stores and returns the product', async () => {
      const cache = new FakeBarcodeCache();
      const lookup = FakeBarcodeLookup.withProduct(TEST_PRODUCT);

      const useCase = new RecognizeFromBarcode(cache, lookup);
      const result = await useCase.execute({ barcode: TEST_PRODUCT.barcode, userId: 'user-1' });

      expect(result.items).toEqual(TEST_PRODUCT.items);
      expect(lookup.callCount).toBe(1);
      // Result is now stored in cache
      expect(cache.hasPositive(TEST_PRODUCT.barcode)).toBe(true);
    });

    it('stores a negative cache entry and throws NotFoundError when external lookup returns null', async () => {
      const cache = new FakeBarcodeCache();
      const lookup = FakeBarcodeLookup.empty();

      const useCase = new RecognizeFromBarcode(cache, lookup);

      await expect(
        useCase.execute({ barcode: 'unknown-barcode', userId: 'user-1' }),
      ).rejects.toMatchObject({ code: 'BARCODE_NOT_FOUND' });

      expect(lookup.callCount).toBe(1);
      expect(cache.hasNegative('unknown-barcode')).toBe(true);
    });
  });

  describe('negative cache scenario', () => {
    it('skips external lookup and throws NotFoundError when cache returns NOT_FOUND', async () => {
      const cache = new FakeBarcodeCache();
      await cache.setNotFound('known-missing-barcode');

      // This lookup should NEVER be called when negative cache is hit
      const lookup = FakeBarcodeLookup.empty();

      const useCase = new RecognizeFromBarcode(cache, lookup);

      await expect(
        useCase.execute({ barcode: 'known-missing-barcode', userId: 'user-1' }),
      ).rejects.toMatchObject({ code: 'BARCODE_NOT_FOUND' });

      // THE CRITICAL ASSERTION: lookup was not called despite the error
      expect(lookup.callCount).toBe(0);
    });
  });
});
