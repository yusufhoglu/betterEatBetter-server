import { env } from '../../../shared/config/env';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { prisma } from '../../../shared/persistence/db';
import { RedisRealtimeBus } from '../adapters/realtime/RedisRealtimeBus';
import { PrismaThreadRepository } from '../adapters/repository/PrismaThreadRepository';
import { R2ChatAttachmentStorage } from '../adapters/storage/R2ChatAttachmentStorage';
import { ThreadAdmin } from '../use-cases/ThreadAdmin';

/**
 * Process-wide singletons shared by messagingRoutes and by other modules'
 * wiring (practice uses ThreadAdmin). The realtime bus in particular must be
 * one per process — it owns the single Redis subscriber connection.
 */
export const realtimeBus = new RedisRealtimeBus(cacheRedisClient, env.REDIS_CACHE_URL);
export const threadRepository = new PrismaThreadRepository(prisma);
export const chatAttachmentStorage = new R2ChatAttachmentStorage();
export const threadAdmin = new ThreadAdmin(threadRepository, realtimeBus, chatAttachmentStorage);
