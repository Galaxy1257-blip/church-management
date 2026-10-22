// One-shot stack verification (R0 gate): migrate deploy + extras + roles +
// seed + integration tests. Requires Docker Desktop running.
// Usage: npm run db:verify
import 'dotenv/config'; // .env → OWNER_DATABASE_URL / DATABASE_URL etc.
import { spawnSync } from 'node:child_process';

function run(cmd, args, env = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

const owner = process.env.OWNER_DATABASE_URL;
if (!owner) {
  console.error('Set OWNER_DATABASE_URL (owner/superuser connection) first — see .env.example');
  process.exit(1);
}

run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'schema.prisma'], { DATABASE_URL: owner });
run('node', ['packages/db/dist/apply-extras.js'], { DATABASE_URL: owner });
run('node', ['packages/db/dist/create-roles.js'], { DATABASE_URL: owner });
run('node', ['packages/db/dist/seed.js']);
// Integration tests run against the dedicated chms_test database (app/platform
// role URLs from .env) so they never touch dev data; skipped if unset.
if (process.env.TEST_DATABASE_URL) run('node', ['scripts/reset-test-db.mjs']);
const testEnv = {};
if (process.env.DATABASE_URL_TEST) testEnv.DATABASE_URL = process.env.DATABASE_URL_TEST;
if (process.env.PLATFORM_DATABASE_URL_TEST) testEnv.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL_TEST;
run('npm', ['run', 'test', '-w', '@chms/api'], testEnv);
console.log('\n✅ db:verify passed — schema, RLS, roles, seed and integration tests are all green.');
