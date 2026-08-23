import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
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

  // Rate limits: photo 5/min, barcode 10/min, text 10/min, search unlimited
  router.post('/photo', authMiddleware, (req, res, next) => controller.handlePhoto(req, res, next));
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
