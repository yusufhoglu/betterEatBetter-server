require('dotenv').config();
require('ts-node/register/transpile-only');

async function main() {
  const { prisma } = require('../src/shared/persistence/db');
  const { PrismaMealLogReadModelRepository } = require('../src/modules/body-analytics/adapters/repository/PrismaMealLogReadModelRepository');
  const { ConsumeOutboxEventsJob } = require('../src/modules/body-analytics/jobs/consumeOutboxEventsJob');

  const job = new ConsumeOutboxEventsJob(prisma, new PrismaMealLogReadModelRepository(prisma));
  const processed = await job.execute();
  console.log(`processed=${processed}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
