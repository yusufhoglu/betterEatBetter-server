import { z } from 'zod';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { BarcodeLookupPort, BarcodeProduct } from '../../ports/BarcodeLookupPort';

const logger = createModuleLogger('food-recognition');

const OFF_BASE_URL = process.env.OPEN_FOOD_FACTS_URL ?? 'https://world.openfoodfacts.org';

/** Minimal schema for OpenFoodFacts product data we care about. */
const offProductSchema = z.object({
  status: z.number(),
  product: z
    .object({
      code: z.string(),
      product_name: z.string().optional(),
      brands: z.string().optional(),
      nutriments: z
        .object({
          'energy-kcal_100g': z.number().optional(),
          proteins_100g: z.number().optional(),
          carbohydrates_100g: z.number().optional(),
          fat_100g: z.number().optional(),
        })
        .optional(),
      serving_size: z.string().optional(),
    })
    .optional(),
});

export class OpenFoodFactsAdapter implements BarcodeLookupPort {
  private readonly baseUrl: string;

  constructor(baseUrl: string = OFF_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async lookup(barcode: string): Promise<BarcodeProduct | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v0/product/${barcode}.json`, {
        headers: { 'User-Agent': 'EatBetterApp/1.0' },
      });
    } catch (err) {
      logger.error({ err, barcode }, 'OpenFoodFacts network error');
      throw new IntegrationError('OFF_NETWORK_ERROR', 'Could not reach OpenFoodFacts', true);
    }

    if (!response.ok) {
      throw new IntegrationError(
        'OFF_SERVICE_ERROR',
        `OpenFoodFacts returned ${response.status}`,
        response.status >= 500,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new IntegrationError('OFF_INVALID_RESPONSE', 'OpenFoodFacts returned non-JSON body', false);
    }

    const parsed = offProductSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn({ barcode, errors: parsed.error.issues }, 'OpenFoodFacts unexpected schema');
      return null;
    }

    if (parsed.data.status === 0 || !parsed.data.product) {
      return null;
    }

    const p = parsed.data.product;
    const n = p.nutriments ?? {};
    const caloriesPer100g = n['energy-kcal_100g'] ?? 0;
    const proteinPer100g = n.proteins_100g ?? 0;
    const carbsPer100g = n.carbohydrates_100g ?? 0;
    const fatPer100g = n.fat_100g ?? 0;

    // Default portion: 100g
    const portionGrams = 100;

    return {
      barcode,
      name: p.product_name ?? 'Unknown product',
      brandName: p.brands,
      items: [
        {
          name: p.product_name ?? 'Unknown product',
          portionGrams,
          calories: caloriesPer100g,
          proteinGrams: proteinPer100g,
          carbsGrams: carbsPer100g,
          fatGrams: fatPer100g,
        },
      ],
      macros: {
        totalCalories: caloriesPer100g,
        totalProteinGrams: proteinPer100g,
        totalCarbsGrams: carbsPer100g,
        totalFatGrams: fatPer100g,
      },
    };
  }
}
