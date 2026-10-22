// Fresh integration-test database per db:verify run (CI parity): drop/recreate
// chms_test, then migrate + extras + roles. Integration tests use hardcoded ids
// (device 'dev-1', webhook event ids), so a reused DB makes reruns fail on
// their own idempotency. No-op when TEST_DATABASE_URL is unset.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import pg from 'pg';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) process.exit(0);

const u = new URL(testUrl);
const dbName = u.pathname.replace(/^\//, '') || 'chms_test';
const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${dbName}`);
  console.log(`reset: ${dbName} recreated`);
} finally {
  await client.end();
}
run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'schema.prisma'], { DATABASE_URL: testUrl });
run('node', ['packages/db/dist/apply-extras.js'], { DATABASE_URL: testUrl });
// OWNER_DATABASE_URL must be overridden too — create-roles prefers it over
// DATABASE_URL, and the inherited .env value points at dev `chms`.
run('node', ['packages/db/dist/create-roles.js'], { DATABASE_URL: testUrl, OWNER_DATABASE_URL: testUrl });
console.log(`reset: ${dbName} provisioned (migrate + extras + roles)`);
