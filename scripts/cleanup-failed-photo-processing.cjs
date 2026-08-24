require('dotenv').config();
require('ts-node/register/transpile-only');

async function removeJobs(queue, states, mealPhotoIds) {
  const jobs = await queue.getJobs(states, 0, 1000, true);
  let removed = 0;

  for (const job of jobs) {
    const mealPhotoId = job.data?.mealPhotoId;
    if (!mealPhotoId || !mealPhotoIds.has(String(mealPhotoId))) {
      continue;
    }

    await job.remove();
    removed += 1;
  }

  return removed;
}

async function main() {
  const { Queue } = require('bullmq');
  const { PrismaClient } = require('@prisma/client');
  const { queueRedisConnection } = require('../src/shared/queue/redisConnection');

  const prisma = new PrismaClient();
  const recognizeQueue = new Queue('recognize-photo', { connection: queueRedisConnection });
  const standardizeQueue = new Queue('standardize-and-copy', { connection: queueRedisConnection });

  try {
    const failedEntries = await prisma.foodEntry.findMany({
      where: { status: 'failed' },
      select: { id: true },
    });

    const mealPhotoIds = new Set(failedEntries.map((entry) => entry.id));

    const [removedRecognizeJobs, removedStandardizeJobs, deletedFoodEntries] = await Promise.all([
      removeJobs(recognizeQueue, ['failed', 'waiting', 'delayed', 'active', 'completed'], mealPhotoIds),
      removeJobs(standardizeQueue, ['failed', 'waiting', 'delayed', 'active', 'completed'], mealPhotoIds),
      prisma.foodEntry.deleteMany({ where: { status: 'failed' } }),
    ]);

    console.log(
      JSON.stringify(
        {
          failedFoodEntryCount: failedEntries.length,
          removedRecognizeJobs,
          removedStandardizeJobs,
          deletedFoodEntries: deletedFoodEntries.count,
        },
        null,
        2,
      ),
    );
  } finally {
    await recognizeQueue.close();
    await standardizeQueue.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
