require('dotenv').config();
require('ts-node/register/transpile-only');

async function main() {
  const { Queue } = require('bullmq');
  const { PrismaClient } = require('@prisma/client');
  const { queueRedisConnection } = require('../src/shared/queue/redisConnection');

  const prisma = new PrismaClient();
  const recognizeQueue = new Queue('recognize-photo', { connection: queueRedisConnection });
  const standardizeQueue = new Queue('standardize-and-copy', { connection: queueRedisConnection });

  const [foodEntries, recognizeCounts, standardizeCounts, recognizeWaiting, standardizeWaiting] = await Promise.all([
    prisma.foodEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    recognizeQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    standardizeQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    recognizeQueue.getJobs(['waiting', 'active', 'failed', 'delayed'], 0, 10, true),
    standardizeQueue.getJobs(['waiting', 'active', 'failed', 'delayed'], 0, 10, true),
  ]);

  console.log(
    JSON.stringify(
      {
        foodEntries,
        recognizeCounts,
        standardizeCounts,
        recognizeWaiting: recognizeWaiting.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
        })),
        standardizeWaiting: standardizeWaiting.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
        })),
      },
      null,
      2,
    ),
  );

  await recognizeQueue.close();
  await standardizeQueue.close();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
