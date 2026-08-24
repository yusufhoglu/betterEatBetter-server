const { spawnSync } = require('node:child_process');
const { URL } = require('node:url');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

function resolveSmokeDatabaseUrl() {
  if (process.env.SMOKE_TEST_DATABASE_URL) {
    return process.env.SMOKE_TEST_DATABASE_URL;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL or SMOKE_TEST_DATABASE_URL must be set');
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name');
  }

  databaseUrl.pathname = `/${databaseName}_smoke`;
  return databaseUrl.toString();
}

const smokeDatabaseUrl = resolveSmokeDatabaseUrl();

process.env.SMOKE_TEST_DATABASE_URL = smokeDatabaseUrl;

console.log(`[smoke] using database: ${smokeDatabaseUrl}`);
console.log('[smoke] make sure this database exists before running the suite');

const jestArgs = [
  'jest',
  '--runInBand',
  '--testPathPattern=test/http/.*\\.smoke\\.test\\.ts$',
  ...process.argv.slice(2),
];

const isWindows = process.platform === 'win32';
const command = isWindows ? 'cmd.exe' : 'npx';
const commandArgs = isWindows ? ['/c', 'npx', ...jestArgs] : jestArgs;
const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
