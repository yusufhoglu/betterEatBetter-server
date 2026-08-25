const { spawnSync } = require('node:child_process');
const { URL } = require('node:url');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

function resolveSmokeDatabaseUrl() {
  if (process.env.SMOKE_TEST_DATABASE_URL) {
    return process.env.SMOKE_TEST_DATABASE_URL;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to derive SMOKE_TEST_DATABASE_URL');
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name');
  }

  databaseUrl.pathname = `/${databaseName}_smoke`;
  return databaseUrl.toString();
}

function runDockerExec(args) {
  const result = spawnSync('docker', args, {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `docker ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result.stdout.trim();
}

const postgresContainer = process.env.SMOKE_TEST_POSTGRES_CONTAINER || 'food-tracking-postgres';
const smokeDatabaseUrl = new URL(resolveSmokeDatabaseUrl());
const primaryDatabaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const smokeDatabaseName = smokeDatabaseUrl.pathname.replace(/^\//, '');
const smokeDatabaseOwner = decodeURIComponent(smokeDatabaseUrl.username || 'app');

if (!smokeDatabaseName) {
  throw new Error('Resolved smoke database URL does not include a database name');
}

if (!smokeDatabaseName.endsWith('_smoke')) {
  throw new Error('Smoke database name must end with "_smoke"');
}

if (primaryDatabaseUrl && smokeDatabaseUrl.toString() === primaryDatabaseUrl.toString()) {
  throw new Error('SMOKE_TEST_DATABASE_URL must not match DATABASE_URL');
}

const existing = runDockerExec([
  'exec',
  postgresContainer,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-tAc',
  `SELECT 1 FROM pg_database WHERE datname = '${smokeDatabaseName}'`,
]);

if (existing === '1') {
  console.log(`[smoke-db] database already exists: ${smokeDatabaseName}`);
  process.exit(0);
}

runDockerExec([
  'exec',
  postgresContainer,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-c',
  `CREATE DATABASE "${smokeDatabaseName}" OWNER "${smokeDatabaseOwner}"`,
]);

runDockerExec([
  'exec',
  postgresContainer,
  'psql',
  '-U',
  'postgres',
  '-d',
  smokeDatabaseName,
  '-c',
  'CREATE EXTENSION IF NOT EXISTS vector',
]);

console.log(`[smoke-db] created database: ${smokeDatabaseName}`);
console.log(`[smoke-db] owner: ${smokeDatabaseOwner}`);
