/**
 * Minimal Cloudflare R2 smoke test for this backend.
 *
 * Purpose:
 * - verify the `.env` R2 credentials are valid
 * - verify the configured bucket accepts object upload
 * - verify object listing works
 * - verify object deletion works
 *
 * How it works:
 * 1. Reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
 *    and `R2_BUCKET_NAME` directly from the local `.env` file.
 * 2. Creates an S3-compatible R2 client.
 * 3. Uploads a temporary object under `smoke-tests/`.
 * 4. Lists objects under that prefix.
 * 5. Deletes the temporary object.
 *
 * Run manually from the project root:
 *   node ./scripts/r2-smoke-test.cjs
 *
 * Expected output:
 *   UPLOAD OK ...
 *   LIST OK ...
 *   DELETE OK ...
 */
const fs = require('fs');
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

function loadEnvFile(path) {
  const text = fs.readFileSync(path, 'utf8');
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

async function main() {
  const env = loadEnvFile('.env');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  const key = `smoke-tests/${Date.now()}.txt`;

  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: 'r2 smoke test',
      ContentType: 'text/plain',
    }),
  );
  console.log(`UPLOAD OK ${key}`);

  const list = await client.send(
    new ListObjectsV2Command({
      Bucket: env.R2_BUCKET_NAME,
      Prefix: 'smoke-tests/',
      MaxKeys: 10,
    }),
  );
  console.log(`LIST OK ${JSON.stringify((list.Contents || []).map((item) => item.Key))}`);

  await client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    }),
  );
  console.log(`DELETE OK ${key}`);
}

main().catch((error) => {
  console.error('R2 TEST FAILED');
  console.error(error && (error.stack || error));
  process.exit(1);
});
