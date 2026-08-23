import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

export const OBJECT_STORAGE_BUCKET = env.R2_BUCKET_NAME;

/** Cloudflare R2, accessed through the S3-compatible SDK. */
export const objectStorageClient = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});
