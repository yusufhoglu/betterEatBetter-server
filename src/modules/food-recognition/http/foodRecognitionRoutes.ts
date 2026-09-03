import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { env } from '../../../shared/config/env';
import { PremiumStatusCache } from '../../subscription/entitlement/PremiumStatusCache';
import { premiumContextMiddleware } from '../../subscription/entitlement/premiumContextMiddleware';
import { PrismaSubscriptionRepository } from '../../subscription/adapters/repository/PrismaSubscriptionRepository';
import { GetSubscriptionEntitlement } from '../../subscription/use-cases/GetSubscriptionEntitlement';
import { RecognizeFromPhoto } from '../use-cases/RecognizeFromPhoto';
import { RecognizeFromBarcode } from '../use-cases/RecognizeFromBarcode';
import { RecognizeFromText } from '../use-cases/RecognizeFromText';
import { SearchFoodCatalog } from '../use-cases/SearchFoodCatalog';
import { RagHttpEstimator } from '../adapters/photo/RagHttpEstimator';
import { ResilientPhotoEstimator } from '../adapters/photo/ResilientPhotoEstimator';
import { OpenFoodFactsAdapter } from '../adapters/barcode/OpenFoodFactsAdapter';
import { RedisBarcodeCache } from '../adapters/barcode/RedisBarcodeCache';
import { LlmTextEstimator } from '../adapters/text/LlmTextEstimator';
import { CatalogSearchAdapter } from '../adapters/search/CatalogSearchAdapter';
import { PrismaFoodEntryRepository } from '../adapters/repository/PrismaFoodEntryRepository';
import { FoodRecognitionController } from './FoodRecognitionController';
import { prisma } from '../../../shared/persistence/db';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';

export function foodRecognitionRoutes(): Router {
  const router = Router();

  // Wire adapters
  const repository = new PrismaFoodEntryRepository(prisma);

  const innerEstimator = new RagHttpEstimator();
  const photoEstimator = new ResilientPhotoEstimator(innerEstimator);

  const barcodeLookup = new OpenFoodFactsAdapter();
  const barcodeCache = new RedisBarcodeCache(cacheRedisClient);

  const textEstimator = new LlmTextEstimator();
  const catalogSearch = new CatalogSearchAdapter();

  // Wire use cases
  const recognizeFromPhoto = new RecognizeFromPhoto(repository);
  const recognizeFromBarcode = new RecognizeFromBarcode(barcodeCache, barcodeLookup);
  const recognizeFromText = new RecognizeFromText(textEstimator);
  const searchFoodCatalog = new SearchFoodCatalog(catalogSearch);

  const controller = new FoodRecognitionController(
    recognizeFromPhoto,
    recognizeFromBarcode,
    recognizeFromText,
    searchFoodCatalog,
    repository,
  );

  // Resolves req.isPremium so handlePhoto can apply the free-tier daily photo
  // quota. Same cache the chat path uses (entitlement:premium:<userId>).
  const premiumContext = premiumContextMiddleware(
    new PremiumStatusCache(
      new GetSubscriptionEntitlement(new PrismaSubscriptionRepository(prisma)),
      cacheRedisClient,
      env.ENTITLEMENT_CACHE_TTL_SECONDS,
    ),
  );

  // Rate limits: photo 5/min burst + FREE_DAILY_PHOTO_LIMIT/day (free tier),
  // barcode 10/min, text 10/min, search unlimited
  router.post('/photo', authMiddleware, premiumContext, (req, res, next) =>
    controller.handlePhoto(req, res, next),
  );
  router.get('/photo/:mealPhotoId', authMiddleware, (req, res, next) =>
    controller.handleGetPhotoStatus(req, res, next),
  );
  router.post('/barcode', authMiddleware, (req, res, next) =>
    controller.handleBarcode(req, res, next),
  );
  router.post('/text', authMiddleware, (req, res, next) => controller.handleText(req, res, next));
  router.get('/search', authMiddleware, (req, res, next) => controller.handleSearch(req, res, next));

  return router;
}
