require('dotenv/config');
const { HeadObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');

const OBJECT_STORAGE_BUCKET = process.env.R2_BUCKET_NAME;

const objectStorageClient = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function pendingObjectKey(mealPhotoId) {
  return `pending/${mealPhotoId}.jpg`;
}

function finalObjectKey(userId, mealPhotoId) {
  return `users/${userId}/meals/${mealPhotoId}.jpg`;
}

async function main() {
  const mealPhotoId = process.argv[2];
  const userId = process.argv[3];

  if (!mealPhotoId || !userId) {
    throw new Error('usage: node scripts/inspect-photo-object.cjs <mealPhotoId> <userId>');
  }

  const prisma = new PrismaClient();
  try {
    const [foodEntry, mealItems] = await Promise.all([
      prisma.foodEntry.findUnique({ where: { id: mealPhotoId } }),
      prisma.mealItem.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const pendingKey = pendingObjectKey(mealPhotoId);
    const finalKey = finalObjectKey(userId, mealPhotoId);

    async function head(key) {
      try {
        const result = await objectStorageClient.send(
          new HeadObjectCommand({ Bucket: OBJECT_STORAGE_BUCKET, Key: key }),
        );
        return {
          exists: true,
          contentLength: result.ContentLength ?? null,
          contentType: result.ContentType ?? null,
          lastModified: result.LastModified ?? null,
        };
      } catch (error) {
        return {
          exists: false,
          errorName: error && error.name ? error.name : 'UnknownError',
          errorMessage: error && error.message ? error.message : String(error),
        };
      }
    }

    const [pendingHead, finalHead] = await Promise.all([head(pendingKey), head(finalKey)]);
    const matchingMealItems = mealItems
      .map((mealItem) => ({
        id: mealItem.id,
        mealType: mealItem.mealType,
        date: mealItem.date,
        entries: Array.isArray(mealItem.entries)
          ? mealItem.entries.filter((entry) => entry && typeof entry === 'object' && entry.id === mealPhotoId)
          : [],
      }))
      .filter((mealItem) => mealItem.entries.length > 0);

    console.log(
      JSON.stringify(
        {
          mealPhotoId,
          userId,
          expectedKeys: {
            pendingKey,
            finalKey,
          },
          pendingHead,
          finalHead,
          foodEntry,
          matchingMealItems,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
